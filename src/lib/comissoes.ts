import type { Natureza } from "@/lib/orcamentos";
import { round2 } from "@/lib/orcamentos";

/** Base de cálculo da comissão. */
export type BaseComissao = "liquido" | "bruto";

export type ParametroNatureza = {
  natureza: Natureza;
  imposto_pct: number;
  outros_custos_pct: number;
  base: BaseComissao;
};

export type Papel = {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
  pct: Record<Natureza, number>;
};

export const NATUREZAS_COMISSAO: Array<{ value: Natureza; label: string }> = [
  { value: "produto", label: "Produto" },
  { value: "servico", label: "Serviço" },
  { value: "recorrente", label: "Serviço recorrente (mensal)" },
];

export const PARAMETROS_PADRAO: Record<Natureza, ParametroNatureza> = {
  produto: { natureza: "produto", imposto_pct: 8.83, outros_custos_pct: 3, base: "liquido" },
  servico: { natureza: "servico", imposto_pct: 13.04, outros_custos_pct: 3, base: "liquido" },
  recorrente: { natureza: "recorrente", imposto_pct: 13.04, outros_custos_pct: 3, base: "liquido" },
};

export const STATUS_COMISSAO = [
  { value: "prevista", label: "Prevista" },
  { value: "a_pagar", label: "A pagar" },
  { value: "paga", label: "Paga" },
] as const;

export type LinhaComissao = { natureza: Natureza; venda: number; compra: number };

export type MemoriaGrupo = {
  natureza: Natureza;
  base: BaseComissao;
  venda: number;
  compra: number;
  imposto_pct: number;
  imposto: number;
  outros_pct: number;
  outros: number;
  /** Líquido sem comissão (margem de contribuição real). */
  liquido: number;
  /** Valor sobre o qual os % de comissão incidem. */
  base_valor: number;
  comissoes: Array<{ papel_id: string; nome: string; pct: number; valor: number }>;
  total_comissoes: number;
  /** Resultado da empresa = líquido − comissões. */
  resultado: number;
};

/**
 * Memória de cálculo por natureza:
 *  imposto   = venda × imposto%
 *  outros    = venda × outros%
 *  líquido   = venda − compra − imposto − outros
 *  comissão  = (líquido | venda) × % do papel
 *  resultado = líquido − Σ comissões
 */
export function calcMemoria(
  linhas: LinhaComissao[],
  parametros: Partial<Record<Natureza, ParametroNatureza>>,
  papeis: Papel[],
): MemoriaGrupo[] {
  const out: MemoriaGrupo[] = [];
  for (const { value: nat } of NATUREZAS_COMISSAO) {
    const ls = linhas.filter((l) => l.natureza === nat);
    if (ls.length === 0) continue;
    const p = parametros[nat] ?? PARAMETROS_PADRAO[nat];
    const venda = round2(ls.reduce((s, l) => s + l.venda, 0));
    const compra = round2(ls.reduce((s, l) => s + l.compra, 0));
    const imposto = round2((venda * p.imposto_pct) / 100);
    const outros = round2((venda * p.outros_custos_pct) / 100);
    const liquido = round2(venda - compra - imposto - outros);
    const base_valor = p.base === "bruto" ? venda : Math.max(0, liquido);
    const comissoes = papeis
      .filter((r) => r.ativo && (r.pct[nat] ?? 0) > 0)
      .sort((a, b) => a.ordem - b.ordem)
      .map((r) => ({ papel_id: r.id, nome: r.nome, pct: r.pct[nat], valor: round2((base_valor * r.pct[nat]) / 100) }));
    const total_comissoes = round2(comissoes.reduce((s, c) => s + c.valor, 0));
    out.push({
      natureza: nat,
      base: p.base,
      venda,
      compra,
      imposto_pct: p.imposto_pct,
      imposto,
      outros_pct: p.outros_custos_pct,
      outros,
      liquido,
      base_valor: round2(base_valor),
      comissoes,
      total_comissoes,
      resultado: round2(liquido - total_comissoes),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Liberação da comissão conforme o recebimento                        */
/* ------------------------------------------------------------------ */

/** "recebimento": libera junto com o que o cliente pagou; "fechamento": tudo na aprovação. */
export type RegraLiberacao = "recebimento" | "fechamento";

export const REGRAS_LIBERACAO: Array<{ value: RegraLiberacao; label: string }> = [
  { value: "recebimento", label: "Conforme o cliente paga as parcelas" },
  { value: "fechamento", label: "Tudo no fechamento da oferta" },
];

/**
 * Quanto da comissão já pode ser pago.
 *  - fechamento: 100%.
 *  - recebimento: entrada% da comissão no fechamento + o restante na proporção recebido / total da oferta.
 * Nunca passa do valor da comissão.
 */
export function comissaoLiberada(opts: {
  comissao: number;
  totalOferta: number;
  recebido: number;
  regra: RegraLiberacao;
  entradaPct?: number;
}): number {
  const comissao = Math.max(0, opts.comissao);
  if (opts.regra === "fechamento") return round2(comissao);
  const entrada = (comissao * Math.min(100, Math.max(0, opts.entradaPct ?? 0))) / 100;
  const prop = opts.totalOferta > 0 ? Math.min(1, Math.max(0, opts.recebido / opts.totalOferta)) : 0;
  return round2(Math.min(comissao, entrada + (comissao - entrada) * prop));
}

/** Valor que pode ser pago agora = liberado − já pago (nunca negativo). */
export const comissaoDisponivel = (liberado: number, pago: number) => round2(Math.max(0, liberado - pago));

/**
 * Recebido por oferta a partir do Financeiro (fonte única): soma o valor dos títulos
 * a receber de origem "oferta" já baixados. Ofertas sem títulos no Financeiro
 * usam as marcações manuais antigas como reserva.
 */
export function recebidoPorOferta(
  titulos: Array<Record<string, unknown>>,
  manuais: Array<Record<string, unknown>> = [],
): Map<string, number> {
  const m = new Map<string, number>();
  const comTitulo = new Set<string>();
  for (const t of titulos) {
    if (t["tipo"] !== "receber" || t["origem_tipo"] !== "oferta" || !t["origem_id"]) continue;
    const id = String(t["origem_id"]);
    comTitulo.add(id);
    if (t["status"] === "pago") m.set(id, Math.round(((m.get(id) ?? 0) + (Number(t["valor"]) || 0)) * 100) / 100);
    else if (!m.has(id)) m.set(id, 0);
  }
  for (const r of manuais) {
    const id = String(r["orcamento_id"] ?? "");
    if (!id || comTitulo.has(id)) continue;
    m.set(id, Math.round(((m.get(id) ?? 0) + (Number(r["valor"]) || 0)) * 100) / 100);
  }
  return m;
}
