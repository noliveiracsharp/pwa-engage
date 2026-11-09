/** SLA por etapa do Kanban: regras puras (sem React). */

export type EstadoSla = "sem_sla" | "ok" | "atencao" | "estourado";

/** Percentual do prazo a partir do qual o card fica em atenção. */
export const SLA_ATENCAO = 0.8;

/** Horas de SLA da etapa; vazio, zero ou inválido = etapa sem SLA. */
export function horasSla(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Jornada do departamento: 24h corridas ou dias/horário comercial (hora de Brasília). */
export type HorarioDia = { inicio: string; fim: string };
/** `horarios` (opcional) define início/fim por dia da semana (0=Dom); sem entrada usa inicio/fim padrão. */
export type Jornada = { modo: "24h" } | { modo: "comercial"; dias: number[]; inicio: string; fim: string; horarios?: Record<string, HorarioDia> };

const HORA_RE = /^\d{2}:\d{2}$/;
/** Horário efetivo de um dia na jornada comercial. */
export function horarioDoDia(j: Extract<Jornada, { modo: "comercial" }>, dia: number): HorarioDia {
  const h = j.horarios?.[String(dia)];
  return h && HORA_RE.test(h.inicio) && HORA_RE.test(h.fim) && h.fim > h.inicio ? h : { inicio: j.inicio, fim: j.fim };
}
export const JORNADA_24H: Jornada = { modo: "24h" };
export const JORNADA_COMERCIAL_PADRAO: Jornada = { modo: "comercial", dias: [1, 2, 3, 4, 5], inicio: "09:00", fim: "18:00" };
/** Fuso fixo de Brasília (sem horário de verão desde 2019). */
const FUSO_MIN = -180;

const hm = (v: string) => { const [h, m] = v.split(":").map(Number); return (h || 0) * 60 + (m || 0); };

/** Lê a jornada salva no quadro; inválida ou ausente = 24h corridas. */
export function lerJornada(v: unknown): Jornada {
  let o = v;
  if (typeof o === "string") { try { o = JSON.parse(o); } catch { return JORNADA_24H; } }
  const r = o as Record<string, unknown> | null;
  if (!r || r["modo"] !== "comercial") return JORNADA_24H;
  const dias = Array.isArray(r["dias"]) ? (r["dias"] as unknown[]).map(Number).filter((d) => d >= 0 && d <= 6) : [];
  const inicio = String(r["inicio"] ?? ""), fim = String(r["fim"] ?? "");
  if (!dias.length || !/^\d{2}:\d{2}$/.test(inicio) || !/^\d{2}:\d{2}$/.test(fim) || hm(fim) <= hm(inicio)) return JORNADA_24H;
  const horarios: Record<string, HorarioDia> = {};
  const hr = r["horarios"] as Record<string, unknown> | undefined;
  if (hr && typeof hr === "object") for (const [k, x] of Object.entries(hr)) {
    const o2 = x as Record<string, unknown> | null;
    const i2 = String(o2?.["inicio"] ?? ""), f2 = String(o2?.["fim"] ?? "");
    if (/^[0-6]$/.test(k) && HORA_RE.test(i2) && HORA_RE.test(f2) && hm(f2) > hm(i2)) horarios[k] = { inicio: i2, fim: f2 };
  }
  return Object.keys(horarios).length ? { modo: "comercial", dias, inicio, fim, horarios } : { modo: "comercial", dias, inicio, fim };
}

/** Minutos de trabalho entre dois instantes, respeitando a jornada. */
export function minutosUteis(de: number, ate: number, j: Jornada): number {
  if (ate <= de) return 0;
  if (j.modo === "24h") return (ate - de) / 60000;
  const off = FUSO_MIN * 60000;
  // Trabalha em "hora local" deslocando os instantes pelo fuso.
  const a = de + off, b = ate + off;
  const DIA = 86400000;
  let total = 0;
  for (let d = Math.floor(a / DIA) * DIA; d < b; d += DIA) {
    const wd = new Date(d).getUTCDay();
    if (!j.dias.includes(wd)) continue;
    const hd = horarioDoDia(j, wd);
    const ini = hm(hd.inicio), fim = hm(hd.fim);
    const s = Math.max(a, d + ini * 60000), e = Math.min(b, d + fim * 60000);
    if (e > s) total += (e - s) / 60000;
  }
  return total;
}

/** Situação do card: desde = quando entrou na etapa; jornada do departamento (padrão 24h). */
export function statusSla(desde: unknown, slaHoras: unknown, agora: Date = new Date(), jornada: Jornada = JORNADA_24H): { estado: EstadoSla; restanteMin: number } {
  const h = horasSla(slaHoras);
  const t = desde ? new Date(String(desde)).getTime() : NaN;
  if (h === null || !Number.isFinite(t)) return { estado: "sem_sla", restanteMin: 0 };
  const prazoMin = h * 60;
  const passadoMin = Math.max(0, minutosUteis(t, agora.getTime(), jornada));
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
