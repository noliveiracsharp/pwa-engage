import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SYSTEM =
  "Você é o Copiloto de Suporte do Atende.ai. Responda em português do Brasil, para pessoas leigas, com frases curtas e passos numerados. Entenda a intenção da dúvida mesmo com palavras diferentes das dos guias (sinônimos, erros de digitação). Use SOMENTE os guias fornecidos; se vários se aplicarem, combine-os. Cite o caminho no menu em negrito (ex.: **Financeiro → Contas a Pagar**) e, ao final, o título do guia usado. Se os guias não cobrirem a pergunta, diga que não encontrou e sugira falar com o suporte humano. Nunca invente telas ou botões.";

const PROVEDORES: Record<string, { baseURL: string; modelo: string }> = {
  gemini: { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", modelo: "gemini-2.5-flash" },
  anthropic: { baseURL: "https://api.anthropic.com/v1", modelo: "claude-sonnet-4-5" },
};

type Autorizacao = { permitido: boolean; origem?: "plataforma" | "propria"; provedor?: string; modelo?: string | null; chave?: string };

/** Copiloto: usa a IA configurada em Empresas → Inteligência Artificial (chave própria) e cai para a IA da plataforma. */
export const perguntarCopiloto = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ pergunta: z.string().min(3).max(1000), contexto: z.string().max(40000), token: z.string().min(10).max(5000) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ texto: string; erro?: string }> => {
    const { createClient } = await import("@supabase/supabase-js");
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/client");
    const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${data.token}` } },
    });
    const { data: u, error } = await db.auth.getUser(data.token);
    if (error || !u.user) return { texto: "", erro: "Sessão expirada. Entre novamente." };

    const prompt = `Guias disponíveis:\n${data.contexto || "(nenhum guia encontrado)"}\n\nPergunta do usuário: ${data.pergunta}`;
    const { streamText } = await import("ai");

    let a: Autorizacao | null = null;
    try {
      const { data: auth } = await db.rpc("ia_autorizar" as never, { _recurso: "controller" } as never);
      a = auth as unknown as Autorizacao;
    } catch (e) { console.error("ia_autorizar ajuda", e); }

    if (a?.permitido && a.origem === "propria" && a.chave) {
      try {
        let model;
        if (a.provedor === "openai") {
          const { createOpenAI } = await import("@ai-sdk/openai");
          model = createOpenAI({ apiKey: a.chave }).responses(a.modelo || "gpt-5-mini");
        } else {
          const p = PROVEDORES[a.provedor ?? ""];
          if (p) {
            const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
            model = createOpenAICompatible({ name: a.provedor!, baseURL: p.baseURL, apiKey: a.chave })(a.modelo || p.modelo);
          }
        }
        if (model) {
          const texto = (await streamText({ model, maxRetries: 0, system: SYSTEM, prompt }).text).trim();
          if (texto) return { texto };
        }
      } catch (e) { console.error("copiloto chave propria", e); }
    }

    const chave = process.env["LOVABLE_API_KEY"];
    if (!chave) return { texto: "", erro: "Copiloto indisponível. Confira a IA em Empresas → Inteligência Artificial." };
    try {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const result = streamText({
        model: createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey: chave,
          headers: { "Lovable-API-Key": chave, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
        }).responses("openai/gpt-6-astra"),
        maxRetries: 0,
        system: SYSTEM,
        prompt,
        providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
      });
      const texto = (await result.text).trim();
      return texto ? { texto } : { texto: "", erro: "O Copiloto não conseguiu responder. Tente reformular ou fale com o suporte." };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      console.error("perguntarCopiloto", e);
      if (status === 402) return { texto: "", erro: "Créditos de IA esgotados. Fale com o suporte humano." };
      if (status === 429) return { texto: "", erro: "Muitas perguntas seguidas. Aguarde alguns segundos." };
      return { texto: "", erro: "Não foi possível responder agora." };
    }
  });
