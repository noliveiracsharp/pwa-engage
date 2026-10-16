/** Regras puras da ativação da Oferta (contrato fechado). */
const norm = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export type EtapaRef = { id: string; descricao: string; ganha?: boolean };

/** Etapa da oferta (pelo id vinculado ou pelo nome da situação). */
export function etapaDaOferta(row: Record<string, unknown>, etapas: EtapaRef[]): EtapaRef | undefined {
  const id = String(row["kanban_etapa_id"] ?? "");
  return etapas.find((e) => e.id === id) ?? etapas.find((e) => norm(e.descricao) === norm(row["situacao"]));
}

/** Situação/etapa que representa contrato fechado: switch "Venda ganha" ou nome Ativação. */
export function situacaoAtivada(situacao: unknown, etapa?: EtapaRef): boolean {
  if (etapa?.ganha) return true;
  return /ativac/.test(norm(situacao));
}

/** Oferta ativada/ganha não pode ser apagada. */
export function ofertaTravada(row: Record<string, unknown>, etapas: EtapaRef[]): boolean {
  return situacaoAtivada(row["situacao"], etapaDaOferta(row, etapas));
}

export function nomeProjetoDaOferta(numero: unknown, cliente: string): string {
  const n = String(numero ?? "").trim();
  return `${n ? `[Oferta #${n.replace(/^#/, "")}] ` : ""}${cliente || "Novo cliente"}`.trim();
}
