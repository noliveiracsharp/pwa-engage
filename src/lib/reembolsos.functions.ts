import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type LeituraComprovante = {
  valor: number | null;
  data: string | null;
  estabelecimento: string | null;
  cnpj: string | null;
  categoria: string | null;
  erro?: string;
};

const vazio: LeituraComprovante = { valor: null, data: null, estabelecimento: null, cnpj: null, categoria: null };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["valor", "data", "estabelecimento", "cnpj", "categoria"],
  properties: {
    valor: { type: ["number", "null"], description: "Valor TOTAL pago em reais" },
    data: { type: ["string", "null"], description: "Data da compra no formato AAAA-MM-DD" },
    estabelecimento: { type: ["string", "null"] },
    cnpj: { type: ["string", "null"], description: "Somente dígitos" },
    categoria: {
      type: ["string", "null"],
      enum: ["alimentacao", "combustivel", "pedagio", "estacionamento", "hospedagem", "transporte", "material", "outros", null],
    },
  },
} as const;

/** Lê cupom fiscal / recibo (imagem ou PDF por URL pública) e devolve os campos para pré-preencher a despesa. */
export const lerComprovante = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ url: z.string().url().max(2000), pdf: z.boolean().optional() }).parse(d))
  .handler(async ({ data }): Promise<LeituraComprovante> => {
    const chave = process.env["LOVABLE_API_KEY"];
    if (!chave) return { ...vazio, erro: "Leitura automática indisponível." };
    const midia = data.pdf
      ? { type: "input_file", file_url: data.url }
      : { type: "input_image", image_url: data.url };
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
        body: JSON.stringify({
          model: "openai/gpt-6-astra",
          stream: true,
          store: false,
          reasoning: { effort: "low" },
          text: { format: { type: "json_schema", name: "comprovante", strict: true, schema: SCHEMA } },
          input: [{
            role: "user",
            content: [
              { type: "input_text", text: "Este é um comprovante de despesa brasileiro (cupom fiscal, nota, recibo ou comprovante de cartão). Extraia o valor total pago, a data, o nome do estabelecimento, o CNPJ e a categoria mais provável. Use null no que não for legível." },
              midia,
            ],
          }],
        }),
      });
      if (!r.ok || !r.body) {
        if (r.status === 402) return { ...vazio, erro: "Créditos de IA esgotados. Preencha manualmente." };
        if (r.status === 429) return { ...vazio, erro: "Muitas leituras agora. Tente de novo em instantes." };
        return { ...vazio, erro: "Não foi possível ler o comprovante." };
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "", txt = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const linhas = buf.split("\n");
        buf = linhas.pop() ?? "";
        for (const l of linhas) {
          if (!l.startsWith("data:")) continue;
          const p = l.slice(5).trim();
          if (!p || p === "[DONE]") continue;
          try {
            const ev = JSON.parse(p) as { type?: string; delta?: string };
            if (ev.type === "response.output_text.delta" && ev.delta) txt += ev.delta;
          } catch { /* frame parcial */ }
        }
      }
      if (!txt.trim()) return { ...vazio, erro: "Não foi possível ler o comprovante." };
      const j = JSON.parse(txt) as LeituraComprovante;
      return {
        valor: typeof j.valor === "number" && j.valor > 0 ? Math.round(j.valor * 100) / 100 : null,
        data: j.data && /^\d{4}-\d{2}-\d{2}$/.test(j.data) ? j.data : null,
        estabelecimento: j.estabelecimento || null,
        cnpj: j.cnpj ? j.cnpj.replace(/\D/g, "") || null : null,
        categoria: j.categoria || null,
      };
    } catch {
      return { ...vazio, erro: "Não foi possível ler o comprovante." };
    }
  });
