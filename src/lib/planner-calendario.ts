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
