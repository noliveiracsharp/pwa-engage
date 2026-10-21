import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";

// Recebe leads de sites, formulários e anúncios. A chave ?k= identifica a empresa.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const Lead = z.object({
  nome: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  telefone: z.string().trim().max(40).optional(),
  empresa: z.string().trim().max(200).optional(),
  origem: z.string().trim().max(80).optional(),
  mensagem: z.string().trim().max(4000).optional(),
}).refine((l) => !!l.email || !!l.telefone, { message: "Informe e-mail ou telefone" });

async function lerCorpo(request: Request): Promise<unknown> {
  const tipo = request.headers.get("content-type") ?? "";
  if (tipo.includes("application/json")) return request.json();
  const form = await request.formData();
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
}

export const Route = createFileRoute("/api/public/leads")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const k = new URL(request.url).searchParams.get("k") ?? "";
        if (!/^[a-f0-9]{32,128}$/i.test(k)) return new Response("Unauthorized", { status: 401, headers: CORS });
        let lead: z.infer<typeof Lead>;
        try {
          lead = Lead.parse(await lerCorpo(request));
        } catch {
          return Response.json({ ok: false, erro: "Dados inválidos" }, { status: 400, headers: CORS });
        }
        const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
        const { error } = await sb.rpc("crm_receber_lead" as never, {
          p_chave: k, p_nome: lead.nome, p_email: lead.email || null, p_telefone: lead.telefone || null,
          p_origem: lead.origem || null, p_mensagem: lead.mensagem || null, p_empresa: lead.empresa || null,
        } as never);
        if (error) {
          const invalida = /chave invalida/i.test(error.message);
          return Response.json({ ok: false }, { status: invalida ? 401 : 500, headers: CORS });
        }
        return Response.json({ ok: true }, { headers: CORS });
      },
    },
  },
});
