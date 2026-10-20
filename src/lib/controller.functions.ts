import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SYSTEM =
  "Você é um controller e consultor de BPO financeiro de pequenas e médias empresas brasileiras. Escreva em português do Brasil, linguagem simples, objetiva e prática. Use somente os números fornecidos; não invente valores. Responda em markdown com exatamente 3 seções: '## Diagnóstico executivo', '## Plano de ação — Despesas', '## Plano de ação — Receitas e cobrança'. Cada plano com 3 a 5 ações numeradas, priorizadas por impacto no caixa.";

/** Endereços compatíveis com OpenAI para chave própria da empresa. */
const PROVEDORES: Record<string, { baseURL: string; modelo: string }> = {
  gemini: { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", modelo: "gemini-2.5-flash" },
  anthropic: { baseURL: "https://api.anthropic.com/v1", modelo: "claude-sonnet-4-5" },
};

type Autorizacao = {
  permitido: boolean;
  motivo?: "plano" | "cota" | "sem_empresa";
  origem?: "plataforma" | "propria";
  provedor?: string;
  modelo?: string | null;
  chave?: string;
  cota?: number | null;
  usado?: number;
};

/** Parecer do Controller: usa a chave própria da empresa ou a IA da plataforma, conforme o plano. */
export const parecerController = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ resumo: z.string().min(2).max(20000), token: z.string().min(10).max(5000) }).parse(d))
  .handler(async ({ data }): Promise<{ texto: string; erro?: string; origem?: string }> => {
    const { createClient } = await import("@supabase/supabase-js");
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/client");
    const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${data.token}` } },
    });
    const { data: auth, error } = await db.rpc("ia_autorizar" as never, { _recurso: "controller" } as never);
    if (error) {
      console.error("ia_autorizar", error);
      return { texto: "", erro: "Configuração de IA não encontrada. Rode o script de IA por empresa no banco." };
    }
    const a = auth as unknown as Autorizacao;
    if (!a.permitido) {
      if (a.motivo === "cota") return { texto: "", erro: `Limite de ${a.cota} pareceres no mês atingido. Contrate o módulo Controller com IA ou use sua própria chave.` };
      if (a.motivo === "sem_empresa") return { texto: "", erro: "Usuário sem empresa vinculada." };
      return { texto: "", erro: "O Parecer do Controller está nos planos Pro e Enterprise, no módulo Controller com IA ou com a chave própria da empresa em Empresas → Inteligência Artificial." };
    }

    const { streamText } = await import("ai");
    try {
      let model;
      if (a.origem === "propria") {
        const chave = a.chave ?? "";
        if (a.provedor === "openai") {
          const { createOpenAI } = await import("@ai-sdk/openai");
          model = createOpenAI({ apiKey: chave }).responses(a.modelo || "gpt-5-mini");
        } else {
          const p = PROVEDORES[a.provedor ?? ""];
          if (!p) return { texto: "", erro: "Provedor de IA inválido." };
          const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
          model = createOpenAICompatible({ name: a.provedor!, baseURL: p.baseURL, apiKey: chave })(a.modelo || p.modelo);
        }
        const result = streamText({ model, maxRetries: 0, system: SYSTEM, prompt: `Indicadores financeiros da empresa (JSON):\n${data.resumo}` });
        const texto = (await result.text).trim();
        return texto ? { texto, origem: "propria" } : { texto: "", erro: "A IA não retornou parecer." };
      }

      const chave = process.env["LOVABLE_API_KEY"];
      if (!chave) return { texto: "", erro: "IA da plataforma indisponível no momento." };
      const { createOpenAI } = await import("@ai-sdk/openai");
      const result = streamText({
        model: createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey: chave,
          headers: { "Lovable-API-Key": chave, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
        }).responses("openai/gpt-6-astra"),
        maxRetries: 0,
        system: SYSTEM,
        prompt: `Indicadores financeiros da empresa (JSON):\n${data.resumo}`,
        providerOptions: {
          openai: { forceReasoning: true, reasoningEffort: "medium", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] },
        },
      });
      const texto = (await result.text).trim();
      return texto ? { texto, origem: "plataforma" } : { texto: "", erro: "A IA não retornou parecer." };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      console.error("parecerController", e);
      if (a.origem === "propria" && (status === 401 || status === 403)) return { texto: "", erro: "A chave de IA da empresa foi recusada pelo provedor. Confira em Empresas → Inteligência Artificial." };
      if (status === 402) return { texto: "", erro: "Créditos de IA esgotados. Tente novamente mais tarde." };
      if (status === 429) return { texto: "", erro: "Muitas solicitações. Tente novamente em instantes." };
      return { texto: "", erro: "Não foi possível gerar o parecer agora." };
    }
  });

const SYSTEM_CHAT =
  "Você é o Controller da empresa: um controller e consultor de BPO financeiro e contábil brasileiro. Responda em português do Brasil, de forma simples, objetiva e prática, em markdown curto. Responda somente sobre finanças, controladoria e contabilidade da empresa. Use apenas os números do contexto JSON fornecido (saldo, indicadores, projeção mensal de entradas/saídas/saldo final, despesas por categoria, inadimplência). Para estimativas futuras, parta da projeção mensal e explique a conta em poucas linhas; se considerar a despesa média mensal (burn) para custos ainda não lançados, deixe isso explícito como cenário. Nunca invente valores; se faltar dado, diga qual. Valores em R$ no formato brasileiro.";

const Msg = z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) });

/** Fale com o Controller: perguntas livres sobre os números da empresa. */
export const perguntarController = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ contexto: z.string().min(2).max(60000), token: z.string().min(10).max(5000), mensagens: z.array(Msg).min(1).max(30) }).parse(d))
  .handler(async ({ data }): Promise<{ texto: string; erro?: string }> => {
    const { createClient } = await import("@supabase/supabase-js");
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/client");
    const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${data.token}` } },
    });
    const { data: auth, error } = await db.rpc("ia_autorizar" as never, { _recurso: "controller" } as never);
    if (error) return { texto: "", erro: "Configuração de IA não encontrada." };
    const a = auth as unknown as Autorizacao;
    if (!a.permitido) {
      if (a.motivo === "cota") return { texto: "", erro: `Limite de ${a.cota} consultas no mês atingido.` };
      if (a.motivo === "sem_empresa") return { texto: "", erro: "Usuário sem empresa vinculada." };
      return { texto: "", erro: "O Controller com IA está nos planos Pro e Enterprise, no módulo Controller com IA ou com a chave própria da empresa." };
    }
    const system = `${SYSTEM_CHAT}\n\nData de hoje: ${new Date().toISOString().slice(0, 10)}.\nContexto financeiro da empresa (JSON):\n${data.contexto}`;
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
        const r = streamText({ model, maxRetries: 0, system, messages: data.mensagens });
        const texto = (await r.text).trim();
        return texto ? { texto } : { texto: "", erro: "A IA não retornou resposta." };
      }
      const chave = process.env["LOVABLE_API_KEY"];
      if (!chave) return { texto: "", erro: "IA da plataforma indisponível no momento." };
      const { createOpenAI } = await import("@ai-sdk/openai");
      const r = streamText({
        model: createOpenAI({ baseURL: "https://ai.gateway.lovable.dev/v1", apiKey: chave, headers: { "Lovable-API-Key": chave, "X-Lovable-AIG-SDK": "vercel-ai-sdk" } }).responses("openai/gpt-6-astra"),
        maxRetries: 0,
        system,
        messages: data.mensagens,
        providerOptions: { openai: { forceReasoning: true, reasoningEffort: "medium", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
      });
      const texto = (await r.text).trim();
      return texto ? { texto } : { texto: "", erro: "A IA não retornou resposta." };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      console.error("perguntarController", e);
      if (a.origem === "propria" && (status === 401 || status === 403)) return { texto: "", erro: "A chave de IA da empresa foi recusada pelo provedor." };
      if (status === 402) return { texto: "", erro: "Créditos de IA esgotados. Tente novamente mais tarde." };
      if (status === 429) return { texto: "", erro: "Muitas solicitações. Tente novamente em instantes." };
      return { texto: "", erro: "Não foi possível responder agora." };
    }
  });
