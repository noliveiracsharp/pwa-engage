import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Parecer do Controller: a IA recebe apenas indicadores já calculados e devolve o diagnóstico em texto. */
export const parecerController = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ resumo: z.string().min(2).max(20000) }).parse(d))
  .handler(async ({ data }): Promise<{ texto: string; erro?: string }> => {
    const chave = process.env["LOVABLE_API_KEY"];
    if (!chave) return { texto: "", erro: "IA não configurada." };
    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText } = await import("ai");
    try {
      const result = streamText({
        model: createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey: chave,
          headers: { "Lovable-API-Key": chave, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
        }).responses("openai/gpt-6-astra"),
        maxRetries: 0,
        system:
          "Você é um controller e consultor de BPO financeiro de pequenas e médias empresas brasileiras. Escreva em português do Brasil, linguagem simples, objetiva e prática. Use somente os números fornecidos; não invente valores. Responda em markdown com exatamente 3 seções: '## Diagnóstico executivo', '## Plano de ação — Despesas', '## Plano de ação — Receitas e cobrança'. Cada plano com 3 a 5 ações numeradas, priorizadas por impacto no caixa.",
        prompt: `Indicadores financeiros da empresa (JSON):\n${data.resumo}`,
        providerOptions: {
          openai: { forceReasoning: true, reasoningEffort: "medium", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] },
        },
      });
      const texto = (await result.text).trim();
      return texto ? { texto } : { texto: "", erro: "A IA não retornou parecer." };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      console.error("parecerController", e);
      if (status === 402) return { texto: "", erro: "Créditos de IA esgotados. Adicione créditos para gerar o parecer." };
      if (status === 429) return { texto: "", erro: "Muitas solicitações. Tente novamente em instantes." };
      return { texto: "", erro: "Não foi possível gerar o parecer agora." };
    }
  });
