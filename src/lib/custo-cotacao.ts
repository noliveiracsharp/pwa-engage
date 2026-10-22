/** Regras puras: redução de custo vinda da cotação aprovada. */
const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

/** Oferta já em Ativação ou Fechamento mantém o custo histórico. */
export function ofertaAceitaNovoCusto(situacao: unknown): boolean {
  return !/ativac|fecha/.test(norm(situacao));
}

/** Só reduz: devolve o novo custo quando o cotado é menor que o atual (ou o atual não existe). */
export function novoCustoMenor(atual: number, cotado: number): number | null {
  if (!(cotado > 0)) return null;
  if (atual > 0 && cotado >= atual - 0.004) return null;
  return r2(cotado);
}

/** Recalcula a linha da Oferta com o novo custo, mantendo o preço de venda. */
export function recalcLinhaCusto(l: { quantidade: unknown; total_linha: unknown; imposto_valor?: unknown }, custo: number) {
  const qtd = Number(l.quantidade) || 0;
  const total = Number(l.total_linha) || 0;
  const imposto = Number(l.imposto_valor) || 0;
  const custo_total = r2(qtd * custo);
  const lucro = r2(total - custo_total - imposto);
  return { preco_custo: custo, custo_total, lucro, margem_pct: total > 0 ? r2((lucro / total) * 100) : 0 };
}
