/** Regras puras do workflow de aprovação de Ofertas (mesmo modelo das Cotações de Compras). */
import { aprovadoresDe, type RegraQuorum, type VotoAprovacao } from "@/lib/aprovacao-compras";

export type ConfigAprovacaoOferta = {
  ativo: boolean;
  aprovadorPrincipalId: string | null;
  aprovadoresAdicionais: string[];
  regra: RegraQuorum;
  /** Oferta a partir deste valor (R$) exige aprovação. 0 = não usa. */
  valorMinimo: number;
  /** Margem final abaixo deste % exige aprovação. 0 = não usa. */
  margemMinima: number;
  /** Desconto acima deste % exige aprovação. 0 = não usa. */
  descontoMaximo: number;
};

export type DadosOferta = { valor: number; margemPct: number; descontoPct: number; montadaPor: string | null };

export type SituacaoOferta = "dispensada" | "pendente" | "aprovada" | "rejeitada" | "sem_configuracao";

/** É aprovador (principal ou adicional)? */
export const ehAprovadorOferta = (cfg: ConfigAprovacaoOferta | null, usuarioId: string | null | undefined) =>
  Boolean(cfg && usuarioId && aprovadoresDe(cfg).includes(String(usuarioId)));

/**
 * Exige aprovação quando o workflow está ligado e quem montou não é aprovador.
 * Sem nenhum gatilho configurado, toda oferta de vendedor passa por aprovação.
 */
export function ofertaExigeAprovacao(cfg: ConfigAprovacaoOferta | null, d: DadosOferta): boolean {
  if (!cfg?.ativo) return false;
  if (ehAprovadorOferta(cfg, d.montadaPor)) return false; // gestor montou: aprova direto
  const v = cfg.valorMinimo || 0, m = cfg.margemMinima || 0, ds = cfg.descontoMaximo || 0;
  if (v <= 0 && m <= 0 && ds <= 0) return true;
  if (v > 0 && d.valor >= v) return true;
  if (m > 0 && d.margemPct < m) return true;
  if (ds > 0 && d.descontoPct > ds) return true;
  return false;
}

export function situacaoOferta(cfg: ConfigAprovacaoOferta | null, d: DadosOferta, votos: VotoAprovacao[]): SituacaoOferta {
  if (!ofertaExigeAprovacao(cfg, d)) return "dispensada";
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

/** Proposta, minuta e ativação só saem com a oferta liberada. */
export const ofertaLiberada = (status: unknown) => !["pendente", "rejeitada", "sem_configuracao"].includes(String(status ?? ""));
