/** Filtro de período navegável (Vencimento): presets, setas e rótulo. Datas ISO yyyy-mm-dd. */
export type PresetPeriodo = "hoje" | "semana" | "mes" | "ano" | "30d" | "12m" | "todo" | "personalizado";
export type Periodo = { preset: PresetPeriodo; de: string; ate: string };

export const PRESETS_PERIODO: { value: PresetPeriodo; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mês" },
  { value: "ano", label: "Este ano" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "12m", label: "Últimos 12 meses" },
  { value: "todo", label: "Todo o período" },
  { value: "personalizado", label: "Personalizado" },
];

const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y!, m! - 1, d!)); };
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addDias = (s: string, n: number) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
const fimMes = (y: number, m0: number) => fmt(new Date(Date.UTC(y, m0 + 1, 0)));
/** Soma meses mantendo o dia (limitado ao último dia do mês). */
const addMeses = (s: string, n: number) => {
  const d = parse(s); const y = d.getUTCFullYear(); const m = d.getUTCMonth() + n;
  const ult = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return fmt(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), ult))));
};
const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** Intervalo do preset tomando `ref` como data base. Semana = segunda a domingo. */
export function periodoPreset(preset: PresetPeriodo, ref = hojeLocal()): Periodo {
  const d = parse(ref); const y = d.getUTCFullYear(); const m = d.getUTCMonth();
  switch (preset) {
    case "hoje": return { preset, de: ref, ate: ref };
    case "semana": { const dow = (d.getUTCDay() + 6) % 7; const de = addDias(ref, -dow); return { preset, de, ate: addDias(de, 6) }; }
    case "mes": return { preset, de: fmt(new Date(Date.UTC(y, m, 1))), ate: fimMes(y, m) };
    case "ano": return { preset, de: `${y}-01-01`, ate: `${y}-12-31` };
    case "30d": return { preset, de: addDias(ref, -29), ate: ref };
    case "12m": return { preset, de: addDias(addMeses(ref, -12), 1), ate: ref };
    case "todo": return { preset, de: "", ate: "" };
    default: return { preset, de: ref, ate: ref };
  }
}

/** Avança (dir=1) ou recua (dir=-1) o período conforme a unidade do preset. */
export function navegarPeriodo(p: Periodo, dir: 1 | -1): Periodo {
  if (p.preset === "todo" || !p.de || !p.ate) return p;
  switch (p.preset) {
    case "hoje": return { ...p, de: addDias(p.de, dir), ate: addDias(p.ate, dir) };
    case "semana": return { ...p, de: addDias(p.de, 7 * dir), ate: addDias(p.ate, 7 * dir) };
    case "30d": return { ...p, de: addDias(p.de, 30 * dir), ate: addDias(p.ate, 30 * dir) };
    case "mes": { const de = addMeses(p.de, dir); const x = parse(de); return { ...p, de, ate: fimMes(x.getUTCFullYear(), x.getUTCMonth()) }; }
    case "ano": { const y = Number(p.de.slice(0, 4)) + dir; return { ...p, de: `${y}-01-01`, ate: `${y}-12-31` }; }
    case "12m": return { ...p, de: addMeses(p.de, 12 * dir), ate: addMeses(p.ate, 12 * dir) };
    default: {
      const dias = Math.round((parse(p.ate).getTime() - parse(p.de).getTime()) / 86400000) + 1;
      return { ...p, de: addDias(p.de, dias * dir), ate: addDias(p.ate, dias * dir) };
    }
  }
}

const br = (s: string) => s.split("-").reverse().join("/");
/** Rótulo exibido no botão central. */
export function rotuloPeriodo(p: Periodo): string {
  if (p.preset === "todo") return "Todo o período";
  if (!p.de || !p.ate) return "Selecione o período";
  if (p.preset === "mes") {
    const s = parse(p.de).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  if (p.preset === "ano") return `Ano ${p.de.slice(0, 4)}`;
  if (p.de === p.ate) return br(p.de);
  return `${br(p.de)} a ${br(p.ate)}`;
}
