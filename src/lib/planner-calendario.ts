/** Regras puras das vistas do calendário do Planner. */
import { inicioSemana, somarDias } from "@/lib/planner";

export type Vista = "dia" | "semana" | "4dias" | "mes" | "ano" | "programacao" | "personalizado";

/** Intervalo [de, ate] (datas ISO) mostrado por cada vista e o passo das setas em dias. */
export function intervaloDaVista(vista: Vista, ref: string, deP: string, ateP: string): { de: string; ate: string; passo: number } {
  switch (vista) {
    case "dia": return { de: ref, ate: ref, passo: 1 };
    case "4dias": return { de: ref, ate: somarDias(ref, 3), passo: 4 };
    case "semana": { const s = inicioSemana(ref); return { de: s, ate: somarDias(s, 6), passo: 7 }; }
    case "mes": {
      const [a, m] = ref.split("-").map(Number) as [number, number];
      const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
      return { de: `${ref.slice(0, 7)}-01`, ate: `${ref.slice(0, 7)}-${String(ultimo).padStart(2, "0")}`, passo: 30 };
    }
    case "ano": return { de: `${ref.slice(0, 4)}-01-01`, ate: `${ref.slice(0, 4)}-12-31`, passo: 365 };
    case "programacao": return { de: ref, ate: somarDias(ref, 59), passo: 60 };
    case "personalizado": return deP <= ateP ? { de: deP, ate: ateP, passo: 1 } : { de: ateP, ate: deP, passo: 1 };
  }
}

/** Horário de trabalho: dias da semana (0=dom..6=sáb) e faixa "HH:MM". */
export type Expediente = { dias: number[]; inicio: string; fim: string };
export const EXPEDIENTE_PADRAO: Expediente = { dias: [1, 2, 3, 4, 5], inicio: "08:00", fim: "18:00" };
const min = (h: string) => { const [a, b] = h.split(":").map(Number); return (a ?? 0) * 60 + (b ?? 0); };

/** true quando o minuto do dia (0..1439) da data ISO está fora do expediente. */
export function foraDoExpediente(dia: string, minuto: number, e: Expediente): boolean {
  const sem = new Date(`${dia}T12:00:00`).getDay();
  if (!e.dias.includes(sem)) return true;
  return minuto < min(e.inicio) || minuto >= min(e.fim);
}
export const minutoInicioExpediente = (e: Expediente) => min(e.inicio);

/** Bloqueio de agenda (indisponível/foco). */
export type Bloqueio = { id: string; usuario_id: string; inicio: string; fim: string; titulo: string };

/** Bloqueios do usuário que colidem com o intervalo [inicio, fim). */
export function conflitosBloqueio(bloqueios: Bloqueio[], usuarioId: string, inicio: Date, fim: Date): Bloqueio[] {
  return bloqueios.filter((b) => b.usuario_id === usuarioId && new Date(b.inicio) < fim && new Date(b.fim) > inicio);
}

/** Cores fixas das agendas sobrepostas (índice na seleção). */
export const CORES_AGENDA = ["primary", "success", "warning", "destructive", "accent"] as const;
