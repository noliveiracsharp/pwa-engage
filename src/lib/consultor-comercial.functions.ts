import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SYSTEM =
  "Você é um Consultor Comercial sênior de vendas B2B no Brasil. Analise a oferta, a linha do tempo de interações e a próxima ação planejada. Escreva em português do Brasil, linguagem direta e prática, em markdown. Use somente os dados fornecidos; não invente fatos. Considere a data de hoje para calcular dias sem contato e prazos. Responda com exatamente 4 seções: '## Probabilidade de fechamento' (um percentual estimado em negrito na primeira linha e a justificativa em 2 a 4 linhas), '## Gaps no atendimento' (lista), '## Riscos' (lista), '## Próximos passos recomendados' (3 a 5 ações numeradas, com o que dizer ao cliente).";

type Autorizacao = { permitido: boolean; motivo?: string; origem?: "plataforma" | "propria"; provedor?: string; modelo?: string | null; chave?: string; cota?: number | null };

const SYSTEM_CLIENTE =
  "Você é um Consultor Comercial sênior de vendas B2B no Brasil, especialista em condomínios. Analise o cliente, a linha do tempo completa (visitas, reuniões, notas, ofertas enviadas/ganhas/perdidas e visitas técnicas). Escreva em português do Brasil, direto e prático, em markdown. Use somente os dados fornecidos; não invente fatos. Considere a data de hoje para calcular dias sem contato. Responda com exatamente 4 seções: '## Momento do cliente' (temperatura em negrito: Frio, Morno ou Quente, e justificativa em 2 a 4 linhas), '## Oportunidades' (lista), '## Riscos e objeções' (lista), '## Próximos passos recomendados' (3 a 5 ações numeradas, com o que dizer ao cliente).";

const PROVEDORES: Record<string, { baseURL: string; modelo: string }> = {
  gemini: { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", modelo: "gemini-2.5-flash" },
  anthropic: { baseURL: "https://api.anthropic.com/v1", modelo: "claude-sonnet-4-5" },
};

/** Análise da oferta pelo Consultor Comercial (IA): probabilidade de fechamento e gaps. */
export const analisarOferta = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ contexto: z.string().min(2).max(60000), token: z.string().min(10).max(5000), modo: z.enum(["oferta", "cliente"]).optional() }).parse(d))
  .handler(async ({ data }): Promise<{ texto: string; erro?: string }> => {
    const { createClient } = await import("@supabase/supabase-js");
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/client");
    const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${data.token}` } },
    });
    const { data: userData, error: userErr } = await db.auth.getUser(data.token);
    if (userErr || !userData.user) return { texto: "", erro: "Sessão expirada. Entre novamente." };

    let a: Autorizacao = { permitido: true, origem: "plataforma" };
    const { data: auth, error } = await db.rpc("ia_autorizar" as never, { _recurso: "controller" } as never);
    if (!error && auth) a = auth as unknown as Autorizacao;
    if (!a.permitido) {
      if (a.motivo === "cota") return { texto: "", erro: `Limite de ${a.cota} análises de IA no mês atingido.` };
      return { texto: "", erro: "A análise com IA está nos planos Pro e Enterprise ou com a chave própria da empresa (Empresas → Inteligência Artificial)." };
    }

    const sistema = data.modo === "cliente" ? SYSTEM_CLIENTE : SYSTEM;
    const prompt = `Data de hoje: ${new Date().toISOString().slice(0, 10)}\nDados ${data.modo === "cliente" ? "do cliente" : "da oferta"} e linha do tempo (JSON):\n${data.contexto}`;
    const { streamText } = await import("ai");
    try {
      if (a.origem === "propria") {
        const chave = a.chave ?? "";
        let model;
        if (a.provedor === "openai") {
          const { createOpenAI } = await import("@ai-sdk/openai");
          model = createOpenAI({ apiKey: chave }).responses(a.modelo || "gpt-5-mini");
        } else {
          const p = PROVEDORES[a.provedor ?? ""];
          if (!p) return { texto: "", erro: "Provedor de IA inválido." };
          const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
          model = createOpenAICompatible({ name: a.provedor!, baseURL: p.baseURL, apiKey: chave })(a.modelo || p.modelo);
        }
        const r = streamText({ model, maxRetries: 0, system: sistema, prompt });
        const texto = (await r.text).trim();
        return texto ? { texto } : { texto: "", erro: "A IA não retornou análise." };
      }
      const chave = process.env["LOVABLE_API_KEY"];
      if (!chave) return { texto: "", erro: "IA da plataforma indisponível no momento." };
      const { createOpenAI } = await import("@ai-sdk/openai");
      const r = streamText({
        model: createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey: chave,
          headers: { "Lovable-API-Key": chave, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
        }).responses("openai/gpt-6-astra"),
        maxRetries: 0,
        system: sistema,
        prompt,
        providerOptions: { openai: { forceReasoning: true, reasoningEffort: "medium", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
      });
      const texto = (await r.text).trim();
      return texto ? { texto } : { texto: "", erro: "A IA não retornou análise." };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      console.error("analisarOferta", e);
      if (a.origem === "propria" && (status === 401 || status === 403)) return { texto: "", erro: "A chave de IA da empresa foi recusada pelo provedor." };
      if (status === 402) return { texto: "", erro: "Créditos de IA esgotados. Tente novamente mais tarde." };
      if (status === 429) return { texto: "", erro: "Muitas solicitações. Tente novamente em instantes." };
      return { texto: "", erro: "Não foi possível gerar a análise agora." };
    }
  });
