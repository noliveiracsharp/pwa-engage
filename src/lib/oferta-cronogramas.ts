import { gerarParcelas, num, round2, toISODate, type Parcela } from "@/lib/orcamentos";

/** Serviço avulso com início de cobrança próprio: sai do parcelamento geral e ganha cronograma separado. */
export const servicoSeparado = (l: { natureza?: unknown; dt_inicio_faturamento?: unknown }) =>
  String(l.natureza ?? "") === "servico" && Boolean(toISODate(l.dt_inicio_faturamento));

export type ParcelaServico = Parcela & {
  /** Índice/identificação da linha de origem. */
  linha: string;
  descricao: string;
  /** Pagador ("" = cliente da Oferta). */
  pagador: string;
  total_parcelas: number;
};

/** Cronograma de recebimento de cada serviço avulso separado: N parcelas mensais a partir do início. */
export function cronogramaServicos(
  linhas: Array<{ linha: string; descricao: string; pagador: string; valor: number; inicio: string; parcelas: number }>,
): ParcelaServico[] {
  const out: ParcelaServico[] = [];
  for (const l of linhas) {
    const valor = round2(Math.max(0, num(l.valor)));
    const inicio = toISODate(l.inicio);
    if (valor <= 0 || !inicio) continue;
    const n = Math.max(1, Math.min(120, Math.floor(num(l.parcelas)) || 1));
    for (const p of gerarParcelas({ total: valor, quantidade: n, primeiraData: inicio, comJuros: false }))
      out.push({ ...p, linha: l.linha, descricao: l.descricao, pagador: l.pagador, total_parcelas: n });
  }
  return out;
}

export type CondTerceiro = { parcelas: string; primeira: string };

/** Custo dos serviços avulsos terceirizados por fornecedor, com a data de início mais cedo dos serviços dele. */
export function terceirosAvulsos(
  linhas: Array<{ natureza: string; execucao: string; fornecedor_id: string; custo: number; dt_inicio_faturamento: string }>,
): Array<{ fornecedor: string; custo: number; inicio: string }> {
  const m = new Map<string, { custo: number; inicio: string }>();
  for (const l of linhas) {
    if (l.natureza !== "servico" || l.execucao !== "terceiro" || !l.fornecedor_id) continue;
    const a = m.get(l.fornecedor_id) ?? { custo: 0, inicio: "" };
    const d = toISODate(l.dt_inicio_faturamento);
    m.set(l.fornecedor_id, { custo: round2(a.custo + Math.max(0, num(l.custo))), inicio: d && (!a.inicio || d < a.inicio) ? d : a.inicio });
  }
  return [...m.entries()].map(([fornecedor, v]) => ({ fornecedor, ...v }));
}

/** Parcelas a pagar a um fornecedor terceirizado: 1º vencimento informado, senão o início do serviço, senão o padrão. */
export function cronogramaTerceiro(custo: number, cfg: Partial<CondTerceiro> | undefined, inicioServico: string, padrao: string): Parcela[] {
  const v = round2(Math.max(0, num(custo)));
  const inicio = toISODate(cfg?.primeira) || toISODate(inicioServico) || toISODate(padrao);
  if (v <= 0 || !inicio) return [];
  return gerarParcelas({ total: v, quantidade: Math.max(1, Math.floor(num(cfg?.parcelas)) || 1), primeiraData: inicio, comJuros: false });
}
