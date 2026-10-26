import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TIPOS = {
  email: "um calendário de 4 pautas de e-mail marketing (uma por semana). Para cada uma: assunto, pré-cabeçalho, objetivo, roteiro do texto em 4 a 6 linhas e chamada para ação.",
  social: "um calendário de 2 semanas de postagens para Instagram, LinkedIn e Facebook (8 posts). Para cada um: dia, rede, formato (carrossel, reels, imagem), gancho de abertura, legenda curta, ideia visual e hashtags.",
  ads: "duas campanhas de anúncios: uma no Google Ads (palavras-chave sugeridas, palavras negativas, 3 títulos de até 30 caracteres, 2 descrições de até 90 caracteres) e uma no Meta Ads (público-alvo, 2 textos principais, título e criativo sugerido). Inclua orçamento diário sugerido em R$ e as métricas a acompanhar.",
} as const;

type Autorizacao = { permitido: boolean; motivo?: string; origem?: "plataforma" | "propria"; provedor?: string; modelo?: string | null; chave?: string; cota?: number | null };

const PROVEDORES: Record<string, { baseURL: string; modelo: string }> = {
  gemini: { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", modelo: "gemini-2.5-flash" },
  anthropic: { baseURL: "https://api.anthropic.com/v1", modelo: "claude-sonnet-4-5" },
};

/** Consultor de Marketing (IA): pautas de e-mail, redes sociais e anúncios para o público-alvo. */
export const sugerirMarketing = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    tipo: z.enum(["email", "social", "ads"]),
    empresa: z.string().max(200),
    negocio: z.string().min(3).max(2000),
    publico: z.string().min(3).max(2000),
    objetivo: z.string().max(1000).optional(),
    token: z.string().min(10).max(5000),
  }).parse(d))
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
      return { texto: "", erro: "O Consultor de Marketing está nos planos Pro e Enterprise ou com a chave própria da empresa (Empresas → Inteligência Artificial)." };
    }

    const system = "Você é um Consultor de Marketing B2B sênior no Brasil. Escreva em português do Brasil, em markdown, com linguagem prática e pronta para usar. Use somente os dados fornecidos; não invente números de clientes, prêmios ou depoimentos. Respeite a LGPD e as políticas do Google e da Meta.";
    const prompt = `Data de hoje: ${new Date().toISOString().slice(0, 10)}
Empresa: ${data.empresa || "(não informada)"}
O que vendemos: ${data.negocio}
Público-alvo: ${data.publico}
Objetivo: ${data.objetivo || "gerar novos clientes"}

Monte ${TIPOS[data.tipo]}`;

    const { streamText } = await import("ai");
    try {
      let model;
      let providerOptions: Record<string, Record<string, never> | Record<string, unknown>> | undefined;
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
      } else {
        const chave = process.env["LOVABLE_API_KEY"];
        if (!chave) return { texto: "", erro: "IA da plataforma indisponível no momento." };
        const { createOpenAI } = await import("@ai-sdk/openai");
        model = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey: chave,
          headers: { "Lovable-API-Key": chave, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
        }).responses("openai/gpt-6-astra");
        providerOptions = { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } };
      }
      const r = streamText({ model, maxRetries: 0, system, prompt, ...(providerOptions ? { providerOptions: providerOptions as never } : {}) });
      const texto = (await r.text).trim();
      return texto ? { texto } : { texto: "", erro: "A IA não retornou sugestões." };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      console.error("sugerirMarketing", e);
      if (a.origem === "propria" && (status === 401 || status === 403)) return { texto: "", erro: "A chave de IA da empresa foi recusada pelo provedor." };
      if (status === 402) return { texto: "", erro: "Créditos de IA esgotados. Tente novamente mais tarde." };
      if (status === 429) return { texto: "", erro: "Muitas solicitações. Tente novamente em instantes." };
      return { texto: "", erro: "Não foi possível gerar as sugestões agora." };
    }
  });
