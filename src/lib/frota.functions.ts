import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Lê a quilometragem do odômetro numa foto (URL pública) usando IA de visão. */
export const lerOdometro = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ url: z.string().url().max(2000) }).parse(d))
  .handler(async ({ data }): Promise<{ km: number | null }> => {
    const chave = process.env["LOVABLE_API_KEY"];
    if (!chave) return { km: null };
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Esta é a foto do painel de um carro. Leia o valor TOTAL do odômetro (quilometragem acumulada, não o parcial/trip). Responda apenas com os dígitos inteiros, sem pontos. Se não conseguir ler, responda NADA.",
                },
                { type: "image_url", image_url: { url: data.url } },
              ],
            },
          ],
        }),
      });
      if (!r.ok) return { km: null };
      const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const txt = String(j.choices?.[0]?.message?.content ?? "").replace(/[.\s]/g, "");
      const m = txt.match(/\d{1,7}/);
      return { km: m ? Number(m[0]) : null };
    } catch {
      return { km: null };
    }
  });
