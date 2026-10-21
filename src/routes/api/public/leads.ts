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

const pagina = (corpo: string) => new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fale conosco</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#f4f5f7;color:#1f2937;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
.c{background:#fff;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.08);padding:28px;max-width:440px;width:100%}
h1{margin:0 0 6px;font-size:22px}p{color:#6b7280;margin:0 0 18px}label{display:block;font-size:13px;font-weight:600;margin:12px 0 4px}
input,textarea{width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:8px;padding:10px;font:inherit}
button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:8px;background:#111827;color:#fff;font-weight:600;font-size:15px;cursor:pointer}
</style></head><body><div class="c">${corpo}</div></body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });

const querHtml = (r: Request) => !(r.headers.get("content-type") ?? "").includes("application/json") && (r.headers.get("accept") ?? "").includes("text/html");

export const Route = createFileRoute("/api/public/leads")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const k = new URL(request.url).searchParams.get("k") ?? "";
        if (!/^[a-f0-9]{32,128}$/i.test(k)) return pagina("<h1>Link inválido</h1><p>Confira o endereço recebido.</p>");
        return pagina(`<h1>Fale conosco</h1><p>Preencha seus dados e retornaremos em breve.</p>
<form method="POST" action="?k=${k}">
<label>Nome *</label><input name="nome" required maxlength="200">
<label>WhatsApp</label><input name="telefone" maxlength="40">
<label>E-mail</label><input name="email" type="email" maxlength="200">
<label>Empresa</label><input name="empresa" maxlength="200">
<input type="hidden" name="origem" value="Link direto">
<label>Mensagem</label><textarea name="mensagem" rows="4" maxlength="4000"></textarea>
<button>Enviar</button></form>`);
      },
      POST: async ({ request }) => {
        const k = new URL(request.url).searchParams.get("k") ?? "";
        if (!/^[a-f0-9]{32,128}$/i.test(k)) return new Response("Unauthorized", { status: 401, headers: CORS });
        let lead: z.infer<typeof Lead>;
        try {
          lead = Lead.parse(await lerCorpo(request));
        } catch {
          if (querHtml(request)) return pagina('<h1>Faltam dados</h1><p>Informe o nome e um e-mail ou WhatsApp.</p><button onclick="history.back()">Voltar</button>');
          return Response.json({ ok: false, erro: "Dados inválidos" }, { status: 400, headers: CORS });
        }
        const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
        const { error } = await sb.rpc("crm_receber_lead" as never, {
          p_chave: k, p_nome: lead.nome, p_email: lead.email || null, p_telefone: lead.telefone || null,
          p_origem: lead.origem || null, p_mensagem: lead.mensagem || null, p_empresa: lead.empresa || null,
        } as never);
        if (error) {
          const invalida = /chave invalida/i.test(error.message);
          if (querHtml(request)) return pagina("<h1>Não foi possível enviar</h1><p>Tente novamente em instantes.</p>");
          return Response.json({ ok: false }, { status: invalida ? 401 : 500, headers: CORS });
        }
        if (querHtml(request)) return pagina("<h1>Mensagem recebida! ✅</h1><p>Obrigado. Em breve entraremos em contato.</p>");
        return Response.json({ ok: true }, { headers: CORS });
      },
    },
  },
});
