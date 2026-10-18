import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SYSTEM =
  "Você é o Copiloto de Suporte do Atende.ai. Responda em português do Brasil, para pessoas leigas, com frases curtas e passos numerados. Use SOMENTE os guias fornecidos. Cite o caminho no menu em negrito (ex.: **Financeiro → Contas a Pagar**). Se os guias não cobrirem a pergunta, diga que não encontrou e sugira falar com o suporte humano. Nunca invente telas ou botões.";

/** Copiloto de suporte: responde com base nos guias enviados pelo cliente (já filtrados pela busca). */
export const perguntarCopiloto = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ pergunta: z.string().min(3).max(1000), contexto: z.string().max(20000), token: z.string().min(10).max(5000) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ texto: string; erro?: string }> => {
    const { createClient } = await import("@supabase/supabase-js");
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/client");
    const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: u, error } = await db.auth.getUser(data.token);
    if (error || !u.user) return { texto: "", erro: "Sessão expirada. Entre novamente." };

    const chave = process.env["LOVABLE_API_KEY"];
    if (!chave) return { texto: "", erro: "Copiloto indisponível no momento." };
    try {
      const { streamText } = await import("ai");
      const { createOpenAI } = await import("@ai-sdk/openai");
      const result = streamText({
        model: createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey: chave,
          headers: { "Lovable-API-Key": chave, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
        }).responses("openai/gpt-6-astra"),
        maxRetries: 0,
        system: SYSTEM,
        prompt: `Guias disponíveis:\n${data.contexto || "(nenhum guia encontrado)"}\n\nPergunta do usuário: ${data.pergunta}`,
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
