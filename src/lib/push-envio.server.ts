import { createClient } from "@supabase/supabase-js";
import { buildPushPayload } from "@block65/webcrypto-web-push";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";
import { VAPID_PUBLICA } from "@/lib/push";

type Aparelho = { endpoint: string; p256dh: string; auth: string };
type Item = { id: string; titulo: string; corpo: string | null; url: string | null; tag: string | null; urgente: boolean; aparelhos: Aparelho[] };

/** Envia as notificações pendentes da fila. Só roda no servidor (segredo + chave VAPID privada). */
export async function enviarPushPendentes(): Promise<{ enviados: number; erro?: string }> {
  const segredo = process.env["INTERFONE_WHATS_SEGREDO"];
  const privada = process.env["VAPID_PRIVATE_KEY"];
  if (!segredo || !privada) return { enviados: 0, erro: "não configurado" };
  const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } });
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
