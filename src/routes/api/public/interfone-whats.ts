import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";
import { dispararMensagem } from "@/lib/atendimentos-envio";
import { instanciaParaAvisos } from "@/lib/instancia-finalidade";
import { mensagemInterfoneWhats } from "@/lib/interfone";

const Corpo = z.object({ id: z.string().uuid(), token: z.string().min(10).max(100) });
type Resp = { destinos?: { nome: string; telefone: string | null }[]; visitante?: string; motivo?: string | null; unidade?: string | null; condominio?: string; instancias?: Record<string, unknown>[] };

/** Avisa por WhatsApp quem entrou no toque da chamada. Só funciona com o token da chamada + chave do servidor. */
export const Route = createFileRoute("/api/public/interfone-whats")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const p = Corpo.safeParse(await request.json().catch(() => null));
        if (!p.success) return Response.json({ ok: false }, { status: 400 });
        const segredo = process.env["INTERFONE_WHATS_SEGREDO"];
        if (!segredo) return Response.json({ ok: false, erro: "não configurado" }, { status: 503 });
        const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (db as any).rpc("cond_interfone_whats", { p_id: p.data.id, p_token: p.data.token, p_segredo: segredo });
        if (error) return Response.json({ ok: false }, { status: 400 });
        const r = (data ?? {}) as Resp;
        const inst = instanciaParaAvisos(r.instancias ?? []);
        if (!inst || !r.destinos?.length) return Response.json({ ok: true, enviados: 0 });
        const link = new URL(request.url).origin;
        let enviados = 0;
        for (const d of r.destinos) {
          if (!d.telefone) continue;
          const texto = mensagemInterfoneWhats({ nome: d.nome, condominio: r.condominio ?? "Condomínio", unidade: r.unidade ?? null, visitante: r.visitante ?? "", motivo: r.motivo ?? null, link });
          const ok = await dispararMensagem({ instancia: inst, mensagemId: null, atendimentoId: null, telefone: d.telefone, texto }).catch(() => false);
          if (ok) enviados++;
        }
        return Response.json({ ok: true, enviados });
      },
    },
  },
});
