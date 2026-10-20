import { createServerFn } from "@tanstack/react-start";
import { exigirLogin } from "@/lib/auth-guard";
import { z } from "zod";
import type { ItemFaturaLido } from "./fatura-importacao";

export type LeituraFatura = { vencimento: string | null; total: number | null; itens: ItemFaturaLido[]; erro?: string };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["vencimento", "total", "itens"],
  properties: {
    vencimento: { type: ["string", "null"], description: "Data de vencimento da fatura, AAAA-MM-DD" },
    total: { type: ["number", "null"], description: "Total a pagar da fatura em reais" },
    itens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["final4", "data", "descricao", "valor", "parcela", "de", "credito"],
        properties: {
          final4: { type: ["string", "null"], description: "4 últimos dígitos do cartão do bloco onde a linha aparece" },
          data: { type: ["string", "null"], description: "Data da compra AAAA-MM-DD" },
          descricao: { type: "string", description: "Estabelecimento como impresso, sem a informação de moeda estrangeira" },
          valor: { type: "number", description: "Valor em reais cobrado NESTA fatura (positivo)" },
          parcela: { type: ["integer", "null"], description: "Número da parcela atual, ex.: 2 em 'Parcela 02 de 10'" },
          de: { type: ["integer", "null"], description: "Total de parcelas, ex.: 10 em 'Parcela 02 de 10'" },
          credito: { type: "boolean", description: "true para pagamentos, estornos e créditos (valor com + ou negativo)" },
        },
      },
    },
  },
} as const;

const PROMPT = `Esta é uma fatura de cartão de crédito brasileira. Extraia o vencimento, o total a pagar e TODAS as linhas de despesa da seção de despesas/lançamentos do mês, de todos os cartões (adicionais incluídos), indicando o final do cartão de cada bloco.
NÃO inclua: simulações de parcelamento da fatura, a lista de "próximas faturas"/compras parceladas futuras, limites, encargos informativos.
Inclua IOF, tarifas e juros que aparecem como linhas de despesa. Marque pagamentos e créditos com credito=true.`;

/** Lê o PDF da fatura do cartão e devolve as compras desta fatura com parcela atual/total. */
export const lerFaturaCartao = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d) => z.object({ url: z.string().url().max(2000) }).parse(d))
  .handler(async ({ data }): Promise<LeituraFatura> => {
    const vazio: LeituraFatura = { vencimento: null, total: null, itens: [] };
    const chave = process.env["LOVABLE_API_KEY"];
    if (!chave) return { ...vazio, erro: "Leitura automática indisponível." };
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
        body: JSON.stringify({
          model: "openai/gpt-6-astra",
          stream: true,
          store: false,
          reasoning: { effort: "low" },
          text: { format: { type: "json_schema", name: "fatura", strict: true, schema: SCHEMA } },
          input: [{ role: "user", content: [{ type: "input_text", text: PROMPT }, { type: "input_file", file_url: data.url }] }],
        }),
      });
      if (!r.ok || !r.body) {
        if (r.status === 402) return { ...vazio, erro: "Créditos de IA esgotados." };
        if (r.status === 429) return { ...vazio, erro: "Muitas leituras agora. Tente de novo em instantes." };
        return { ...vazio, erro: "Não foi possível ler a fatura." };
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
      if (!txt.trim()) return { ...vazio, erro: "Não foi possível ler a fatura." };
      const j = JSON.parse(txt) as LeituraFatura;
      const dataOk = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
      return {
        vencimento: dataOk(j.vencimento),
        total: typeof j.total === "number" ? Math.round(j.total * 100) / 100 : null,
        itens: (j.itens ?? []).map((i) => ({
          final4: i.final4 ? i.final4.replace(/\D/g, "").slice(-4) || null : null,
          data: dataOk(i.data),
          descricao: String(i.descricao ?? "").trim(),
          valor: Math.round(Math.abs(Number(i.valor) || 0) * 100) / 100,
          parcela: i.parcela && i.de && i.de > 1 ? i.parcela : null,
          de: i.parcela && i.de && i.de > 1 ? i.de : null,
          credito: !!i.credito,
        })),
      };
    } catch {
      return { ...vazio, erro: "Não foi possível ler a fatura." };
    }
  });
