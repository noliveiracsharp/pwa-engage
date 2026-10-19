/** Regras puras do workflow de aprovação de compras (cotação → pedido). */

export type RegraQuorum = "principal" | "principal_mais_um" | "todos";

export type ConfigAprovacao = {
  ativo: boolean;
  aprovadorPrincipalId: string | null;
  aprovadoresAdicionais: string[];
  regra: RegraQuorum;
  /** Valor mínimo (R$) a partir do qual exige aprovação. 0 = sempre. */
  valorMinimo: number;
};

export type VotoAprovacao = { usuarioId: string; status: "aprovado" | "rejeitado"; justificativa?: string | null; em?: string | null };

export type SituacaoAprovacao = "dispensada" | "pendente" | "aprovada" | "rejeitada" | "sem_configuracao";

export const REGRAS_QUORUM: { value: RegraQuorum; label: string }[] = [
  { value: "principal", label: "Apenas o aprovador principal" },
  { value: "principal_mais_um", label: "Principal + pelo menos 1 adicional" },
  { value: "todos", label: "Todos os aprovadores" },
];

export function exigeAprovacao(cfg: ConfigAprovacao | null, valorTotal: number): boolean {
  if (!cfg?.ativo) return false;
  return valorTotal >= (cfg.valorMinimo || 0);
}

/** Lista única de aprovadores (principal primeiro). */
export function aprovadoresDe(cfg: ConfigAprovacao): string[] {
  const out: string[] = [];
  if (cfg.aprovadorPrincipalId) out.push(cfg.aprovadorPrincipalId);
  for (const a of cfg.aprovadoresAdicionais) if (a && !out.includes(a)) out.push(a);
  return out;
}

export function situacaoAprovacao(cfg: ConfigAprovacao | null, valorTotal: number, votos: VotoAprovacao[]): SituacaoAprovacao {
  if (!exigeAprovacao(cfg, valorTotal)) return "dispensada";
  const c = cfg!;
  if (!c.aprovadorPrincipalId) return "sem_configuracao";
  const validos = new Set(aprovadoresDe(c));
  const ultimo = new Map<string, VotoAprovacao>();
  for (const v of votos) if (validos.has(v.usuarioId)) ultimo.set(v.usuarioId, v);
  if ([...ultimo.values()].some((v) => v.status === "rejeitado")) return "rejeitada";
  const aprovou = (id: string) => ultimo.get(id)?.status === "aprovado";
  if (!aprovou(c.aprovadorPrincipalId)) return "pendente";
  const adicionais = aprovadoresDe(c).filter((a) => a !== c.aprovadorPrincipalId);
  if (c.regra === "principal") return "aprovada";
  if (c.regra === "principal_mais_um") return adicionais.length === 0 || adicionais.some(aprovou) ? "aprovada" : "pendente";
  return adicionais.every(aprovou) ? "aprovada" : "pendente";
}

export const podeGerarPedido = (s: SituacaoAprovacao) => s === "dispensada" || s === "aprovada";
