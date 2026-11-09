/** SLA por etapa do Kanban: regras puras (sem React). */

export type EstadoSla = "sem_sla" | "ok" | "atencao" | "estourado";

/** Percentual do prazo a partir do qual o card fica em atenção. */
export const SLA_ATENCAO = 0.8;

/** Horas de SLA da etapa; vazio, zero ou inválido = etapa sem SLA. */
export function horasSla(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Situação do card: desde = quando entrou na etapa. */
export function statusSla(desde: unknown, slaHoras: unknown, agora: Date = new Date()): { estado: EstadoSla; restanteMin: number } {
  const h = horasSla(slaHoras);
  const t = desde ? new Date(String(desde)).getTime() : NaN;
  if (h === null || !Number.isFinite(t)) return { estado: "sem_sla", restanteMin: 0 };
  const prazoMin = h * 60;
  const passadoMin = Math.max(0, (agora.getTime() - t) / 60000);
  const restanteMin = Math.round(prazoMin - passadoMin);
  if (passadoMin >= prazoMin) return { estado: "estourado", restanteMin };
  if (passadoMin >= prazoMin * SLA_ATENCAO) return { estado: "atencao", restanteMin };
  return { estado: "ok", restanteMin };
}

/** Texto curto: "2h 10min", "3d 4h". */
export function duracaoCurta(min: number): string {
  const m = Math.abs(Math.round(min));
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}min` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

export function rotuloSla(s: { estado: EstadoSla; restanteMin: number }): string {
  if (s.estado === "sem_sla") return "";
  if (s.estado === "estourado") return `SLA estourado há ${duracaoCurta(s.restanteMin)}`;
  return `SLA: faltam ${duracaoCurta(s.restanteMin)}`;
}
