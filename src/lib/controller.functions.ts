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
      return { texto: "", erro: "O Parecer do Controller está nos planos Pro e Enterprise, no módulo Controller com IA ou com sua própria chave em Configurações da IA." };
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
      if (a.origem === "propria" && (status === 401 || status === 403)) return { texto: "", erro: "A chave de IA da empresa foi recusada pelo provedor. Confira em Configurações da IA." };
      if (status === 402) return { texto: "", erro: "Créditos de IA esgotados. Tente novamente mais tarde." };
      if (status === 429) return { texto: "", erro: "Muitas solicitações. Tente novamente em instantes." };
      return { texto: "", erro: "Não foi possível gerar o parecer agora." };
    }
  });
