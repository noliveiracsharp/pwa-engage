import { createClient } from "@supabase/supabase-js";
import { buildPushPayload } from "@block65/webcrypto-web-push";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";
import { VAPID_PUBLICA } from "@/lib/push";

type Aparelho = { endpoint: string; p256dh: string; auth: string };
type Item = { id: string; titulo: string; corpo: string | null; url: string | null; tag: string | null; urgente: boolean; aparelhos: Aparelho[] };

/** Segredo do servidor: variável de ambiente ou o padrão gravado em cond_interfone_segredo (hospedagens sem .env). */
export const segredoServidor = (): string => process.env["INTERFONE_WHATS_SEGREDO"] || "d4bffe1933df9294d26844db8e6697ecb6e40e1923deae5a";

const novoDb = () => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } });

/** Chave VAPID privada: variável de ambiente (e grava no banco se faltar) ou lida do banco. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chavePrivada(db: any, segredo: string): Promise<string | null> {
  const env = process.env["VAPID_PRIVATE_KEY"];
  if (env) {
    await db.rpc("push_vapid_salvar", { p_segredo: segredo, p_valor: env }).catch(() => undefined);
    return env;
  }
  const { data } = await db.rpc("push_vapid", { p_segredo: segredo });
  return typeof data === "string" && data ? data : null;
}

/** Envia as notificações pendentes da fila. Só roda no servidor. */
export async function enviarPushPendentes(): Promise<{ enviados: number; erro?: string }> {
  const segredo = segredoServidor();
  const db = novoDb();
  const privada = await chavePrivada(db, segredo);
  if (!privada) return { enviados: 0, erro: "não configurado" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any).rpc("push_pendentes", { p_segredo: segredo });
  if (error) return { enviados: 0, erro: error.message };
  const itens = (data ?? []) as Item[];
  if (!itens.length) return { enviados: 0 };
  const vapid = { subject: "mailto:suporte@conectcon.app", publicKey: VAPID_PUBLICA, privateKey: privada };
  const invalidos: string[] = [];
  let enviados = 0;
  await Promise.all(itens.flatMap((it) => it.aparelhos.map(async (a) => {
    try {
      const payload = await buildPushPayload(
        { data: JSON.stringify({ titulo: it.titulo, corpo: it.corpo, url: it.url, tag: it.tag, urgente: it.urgente }), options: { ttl: it.urgente ? 60 : 86400, urgency: it.urgente ? "high" : "normal" } },
        { endpoint: a.endpoint, expirationTime: null, keys: { p256dh: a.p256dh, auth: a.auth } },
        vapid,
      );
      const r = await fetch(a.endpoint, payload);
      if (r.status === 404 || r.status === 410) invalidos.push(a.endpoint);
      else if (r.ok) enviados++;
      else console.error("push falhou", r.status, await r.text().catch(() => ""));
    } catch (e) { console.error("push erro", e); }
  })));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).rpc("push_concluir", { p_segredo: segredo, p_ids: itens.map((i) => i.id), p_invalidos: invalidos });
  return { enviados };
}
