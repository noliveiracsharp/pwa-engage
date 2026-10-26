/** Regras puras do workflow de aprovação de compras (cotação → pedido). */

export type RegraQuorum = "principal" | "principal_mais_um" | "todos";

/** Faixa de alçada: compras até `ate` (R$) precisam de `aprovacoes` votos (o principal é sempre o 1º). `ate` null = acima de tudo. */
export type FaixaAlcada = { ate: number | null; aprovacoes: number };

export type ConfigAprovacao = {
  ativo: boolean;
  aprovadorPrincipalId: string | null;
  aprovadoresAdicionais: string[];
  regra: RegraQuorum;
  /** Valor (R$) por compra a partir do qual exige aprovação. 0 = não usa este critério. */
  valorMinimo: number;
  /** Limite mensal (R$) de compras sem aprovação, somando os pedidos do mês. 0 = sem limite mensal. */
  limiteMensal?: number;
  /** Faixas de alçada por valor. Vazio = usa a `regra`. */
  faixas?: FaixaAlcada[];
};

export type VotoAprovacao = { usuarioId: string; status: "aprovado" | "rejeitado"; justificativa?: string | null; em?: string | null };

export type SituacaoAprovacao = "dispensada" | "pendente" | "aprovada" | "rejeitada" | "sem_configuracao";

export const REGRAS_QUORUM: { value: RegraQuorum; label: string }[] = [
  { value: "principal", label: "Apenas o aprovador principal" },
  { value: "principal_mais_um", label: "Principal + pelo menos 1 adicional" },
  { value: "todos", label: "Todos os aprovadores" },
];

/**
 * Exige aprovação quando a compra atinge o valor mínimo, ou quando o acumulado do mês
 * (pedidos já gerados) somado a esta compra ultrapassa o limite mensal.
 * Sem nenhum dos dois critérios configurados, toda compra passa por aprovação.
 */
export function exigeAprovacao(cfg: ConfigAprovacao | null, valorTotal: number, acumuladoMes = 0): boolean {
  if (!cfg?.ativo) return false;
  const min = cfg.valorMinimo || 0;
  const lim = cfg.limiteMensal || 0;
  if (min <= 0 && lim <= 0) return true;
  if (min > 0 && valorTotal >= min) return true;
  if (lim > 0 && acumuladoMes + valorTotal > lim + 0.004) return true;
  return false;
}

/** Quantas aprovações a compra precisa pela faixa de valor (null = sem faixas, usa a regra). */
export function aprovacoesPorFaixa(cfg: ConfigAprovacao, valorTotal: number): number | null {
  const fx = (cfg.faixas ?? []).filter((f) => f.aprovacoes > 0);
  if (!fx.length) return null;
  const ord = [...fx].sort((a, b) => (a.ate ?? Infinity) - (b.ate ?? Infinity));
  const f = ord.find((x) => x.ate == null || valorTotal <= x.ate) ?? ord[ord.length - 1];
  return f.aprovacoes;
}

/** Lista única de aprovadores (principal primeiro). */
export function aprovadoresDe(cfg: ConfigAprovacao): string[] {
  const out: string[] = [];
  if (cfg.aprovadorPrincipalId) out.push(cfg.aprovadorPrincipalId);
  for (const a of cfg.aprovadoresAdicionais) if (a && !out.includes(a)) out.push(a);
  return out;
}

export function situacaoAprovacao(cfg: ConfigAprovacao | null, valorTotal: number, votos: VotoAprovacao[], acumuladoMes = 0): SituacaoAprovacao {
  if (!exigeAprovacao(cfg, valorTotal, acumuladoMes)) return "dispensada";
  const c = cfg!;
  if (!c.aprovadorPrincipalId) return "sem_configuracao";
  const validos = new Set(aprovadoresDe(c));
  const ultimo = new Map<string, VotoAprovacao>();
  for (const v of votos) if (validos.has(v.usuarioId)) ultimo.set(v.usuarioId, v);
  if ([...ultimo.values()].some((v) => v.status === "rejeitado")) return "rejeitada";
  const aprovou = (id: string) => ultimo.get(id)?.status === "aprovado";
  if (!aprovou(c.aprovadorPrincipalId)) return "pendente";
  const adicionais = aprovadoresDe(c).filter((a) => a !== c.aprovadorPrincipalId);
  const porFaixa = aprovacoesPorFaixa(c, valorTotal);
  if (porFaixa != null) {
    const precisaAdic = Math.min(porFaixa - 1, adicionais.length);
    return adicionais.filter(aprovou).length >= precisaAdic ? "aprovada" : "pendente";
  }
  if (c.regra === "principal") return "aprovada";
  if (c.regra === "principal_mais_um") return adicionais.length === 0 || adicionais.some(aprovou) ? "aprovada" : "pendente";
  return adicionais.every(aprovou) ? "aprovada" : "pendente";
}

export const podeGerarPedido = (s: SituacaoAprovacao) => s === "dispensada" || s === "aprovada";
