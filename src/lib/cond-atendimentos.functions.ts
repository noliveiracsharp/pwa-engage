import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type AnaliseReputacao = { resumo: string; sentimento: "positivo" | "neutro" | "negativo"; pontosFortes: string[]; dores: string[]; recomendacoes: string[]; erro?: string };

/** IA: lê os atendimentos do período (já anonimizados no navegador) e avalia a reputação da gestão. */
export const analisarReputacaoIA = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    condominio: z.string().max(200),
    indice: z.number().min(0).max(100),
    chamados: z.array(z.object({ assunto: z.string().max(120), status: z.string().max(40), nota: z.number().nullable(), sla: z.string().max(20), texto: z.string().max(600) })).max(150),
    token: z.string().min(10).max(5000),
  }).parse(d))
  .handler(async ({ data }): Promise<AnaliseReputacao> => {
    const vazio: AnaliseReputacao = { resumo: "", sentimento: "neutro", pontosFortes: [], dores: [], recomendacoes: [] };
    const { createClient } = await import("@supabase/supabase-js");
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/client");
    const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${data.token}` } } });
    const { data: u, error: ue } = await db.auth.getUser(data.token);
    if (ue || !u.user) return { ...vazio, erro: "Sessão expirada. Entre novamente." };
    const { modeloIA } = await import("@/lib/marketing-consultor.functions");
    type Aut = Parameters<typeof modeloIA>[0];
    let a: Aut = { permitido: true, origem: "plataforma" };
    const { data: auth, error } = await db.rpc("ia_autorizar" as never, { _recurso: "controller" } as never);
    if (!error && auth) a = auth as unknown as Aut;
    if (!a.permitido) return { ...vazio, erro: a.motivo === "cota" ? `Limite de ${a.cota} usos de IA no mês atingido.` : "A IA está nos planos Pro e Enterprise ou com a chave própria da empresa." };
    if (!data.chamados.length) return { ...vazio, erro: "Não há atendimentos no período para analisar." };

    const linhas = data.chamados.map((c, i) => `${i + 1}. [${c.assunto}] status=${c.status} sla=${c.sla} nota=${c.nota ?? "-"} :: ${c.texto}`).join("\n");
    const system = "Você é analista de qualidade de atendimento de condomínios no Brasil. Avalie a percepção dos moradores sobre a gestão (síndico/administração) com base nos chamados. Seja objetivo, use português do Brasil, não cite nomes nem unidades. Responda somente com json válido.";
    const prompt = `Condomínio: ${data.condominio}\nÍndice estatístico de reputação calculado: ${data.indice}/100\n\nChamados (resumidos):\n${linhas}\n\nResponda em json: {"resumo":"até 90 palavras","sentimento":"positivo|neutro|negativo","pontosFortes":["até 4"],"dores":["até 5 temas recorrentes"],"recomendacoes":["até 5 ações práticas para o síndico"]}`;
    const { streamText } = await import("ai");
    try {
      const { model, providerOptions } = await modeloIA(a);
      if (!model) return { ...vazio, erro: "Provedor de IA indisponível." };
      const r = streamText({ model, maxRetries: 0, system, prompt, ...(providerOptions ? { providerOptions: providerOptions as never } : {}) });
      const bruto = (await r.text).trim();
      const m = bruto.match(/\{[\s\S]*\}/);
      const j = m ? (JSON.parse(m[0]) as Record<string, unknown>) : {};
      const lista = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).slice(0, 300)).slice(0, 6) : []);
      const sent = ["positivo", "neutro", "negativo"].includes(String(j["sentimento"])) ? (String(j["sentimento"]) as AnaliseReputacao["sentimento"]) : "neutro";
      return { resumo: String(j["resumo"] ?? "").slice(0, 1200), sentimento: sent, pontosFortes: lista(j["pontosFortes"]), dores: lista(j["dores"]), recomendacoes: lista(j["recomendacoes"]) };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      console.error("analisarReputacaoIA", e);
      if (status === 402) return { ...vazio, erro: "Créditos de IA esgotados. Tente novamente mais tarde." };
      if (status === 429) return { ...vazio, erro: "Muitas solicitações. Tente novamente em instantes." };
      return { ...vazio, erro: "Não foi possível analisar agora." };
    }
  });
