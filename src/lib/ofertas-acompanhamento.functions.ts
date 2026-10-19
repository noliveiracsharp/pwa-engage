import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { exigirLogin } from "./auth-guard";
import { z } from "zod";
import { telefoneConsulta, resultadoWhatsApp } from "./whatsapp-verificacao";

async function bancoUsuario() {
  const { createClient } = await import("@supabase/supabase-js");
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/client");
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: getRequestHeader("authorization") ?? "" } } });
}
export const verificarNumeroWhatsApp = createServerFn({ method: "POST" }).middleware([exigirLogin])
  .inputValidator(d => z.object({ telefone: z.string().max(40), atualizar: z.boolean().optional() }).parse(d))
  .handler(async ({ data }) => {
    const telefone = telefoneConsulta(data.telefone);
    if (!telefone) return { status: "invalido" as const };
    const db = await bancoUsuario();
    const { data: empresa, error: empErro } = await db.rpc("acompanhamento_empresa");
    if (empErro || !empresa) return { status: "indisponivel" as const, mensagem: "Consulta indisponível. Confira a instalação e as permissões." };
    if (!data.atualizar) {
      const { data: cache } = await db.from("whatsapp_verificacoes").select("possui,verificado_em").eq("empresa_id", empresa).eq("telefone", telefone).maybeSingle();
      if (cache && Date.now() - Date.parse(cache.verificado_em) < 86400000) return { status: cache.possui ? "possui" as const : "nao_possui" as const };
    }
    const { data: instancias, error } = await db.from("empresas_instancias").select("*").eq("empresa_id", empresa);
    if (error) return { status: "indisponivel" as const, mensagem: "Sem acesso à instância de WhatsApp da empresa." };
    const inst = instancias?.find(i => i.status !== false && i.ativo !== false && i.tipo !== "chat" && i.instance_id && i.token);
    if (!inst) return { status: "indisponivel" as const, mensagem: "Nenhuma instância Z-API disponível para consulta." };
    try {
      const headers: Record<string,string> = {};
      if (inst.client_token || inst.security_token) headers["Client-Token"] = String(inst.client_token || inst.security_token);
      const r = await fetch(`https://api.z-api.io/instances/${encodeURIComponent(inst.instance_id)}/token/${encodeURIComponent(inst.token)}/phone-exists/${telefone}`, { headers, signal: AbortSignal.timeout(12000) });
      const text = await r.text();
      if (!r.ok) return { status: "indisponivel" as const, mensagem: `Z-API recusou a consulta (${r.status}).` };
      const possui = resultadoWhatsApp(JSON.parse(text));
      if (possui === null) return { status: "indisponivel" as const, mensagem: "A Z-API não confirmou o número." };
      const { error: salvarErro } = await db.rpc("whatsapp_registrar_verificacao", { p_telefone: telefone, p_possui: possui });
      return { status: possui ? "possui" as const : "nao_possui" as const, mensagem: salvarErro ? "Consulta concluída, mas não foi possível salvar o resultado." : undefined };
    } catch { return { status: "indisponivel" as const, mensagem: "Não foi possível consultar a Z-API agora." }; }
  });
