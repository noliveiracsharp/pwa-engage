/** Regras puras da sindicatura do condomínio (síndico morador x profissional PJ). */
export type Sindicatura = {
  modalidade?: string;
  empresa_id?: string;
  cond_unidade_id?: string;
  sindico_nome?: string;
  inicio?: string;
  fim?: string;
};

export const MODALIDADES_SINDICO = [
  { value: "morador", label: "Síndico morador (orgânico)" },
  { value: "profissional", label: "Síndico profissional (empresa PJ)" },
];

export function validarSindicatura(v: Sindicatura): string | null {
  if (!v.modalidade) return "Informe a modalidade do síndico.";
  if (!v.sindico_nome?.trim()) return "Informe o nome do síndico.";
  if (v.modalidade === "morador" && !v.cond_unidade_id) return "Informe a unidade do síndico morador.";
  if (v.modalidade === "profissional" && !v.empresa_id) return "Informe a empresa de sindicatura.";
  if (v.inicio && v.fim && v.fim < v.inicio) return "O fim do mandato não pode ser antes do início.";
  return null;
}

/** Ao trocar a modalidade, limpa o vínculo que não se aplica. */
export function normalizarSindicatura(v: Sindicatura): Sindicatura {
  if (v.modalidade === "morador") return { ...v, empresa_id: "" };
  if (v.modalidade === "profissional") return { ...v, cond_unidade_id: "" };
  return v;
}

/** Dias até o fim do mandato (null quando sem data). */
export function diasParaFimMandato(fim: string | null | undefined, hoje: string): number | null {
  if (!fim) return null;
  return Math.round((Date.parse(fim) - Date.parse(hoje)) / 86_400_000);
}

/** Papéis que um parceiro exerce em cada condomínio da carteira. */
export type PapelCarteira = "administradora" | "facilities" | "sindicatura";
export function papeisNaCarteira(
  parceiroId: string,
  cond: { administradora_id?: string | null; facilities_id?: string | null },
  sindicaturaEmpresaId?: string | null,
): PapelCarteira[] {
  const r: PapelCarteira[] = [];
  if (cond.administradora_id === parceiroId) r.push("administradora");
  if (cond.facilities_id === parceiroId) r.push("facilities");
  if (sindicaturaEmpresaId === parceiroId) r.push("sindicatura");
  return r;
}

/** Antecedência padrão (dias) do alerta de fim de mandato, quando o condomínio não configurou. */
export const ALERTA_MANDATO_PADRAO = 60;

export type SituacaoMandato = "vencido" | "alerta" | "ok";
/** Situação do mandato: vencido após o fim; alerta dentro da antecedência configurada. */
export function situacaoMandato(fim: string | null | undefined, hoje: string, antecedencia?: number | null): { situacao: SituacaoMandato; dias: number } | null {
  const dias = diasParaFimMandato(fim, hoje);
  if (dias == null) return null;
  const limite = antecedencia != null && antecedencia >= 0 ? antecedencia : ALERTA_MANDATO_PADRAO;
  return { situacao: dias < 0 ? "vencido" : dias <= limite ? "alerta" : "ok", dias };
}
