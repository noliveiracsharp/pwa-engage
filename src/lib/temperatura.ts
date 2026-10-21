/** Temperatura comercial da Oferta (usada no Kanban quando o quadro habilita). */
export const TEMPERATURAS = [
  { value: "frio", label: "Frio", dot: "bg-sky-400", card: "bg-temp-frio" },
  { value: "morno", label: "Morno", dot: "bg-amber-400", card: "bg-temp-morno" },
  { value: "quente", label: "Quente", dot: "bg-rose-500", card: "bg-temp-quente" },
] as const;

/** Temperaturas automáticas: definidas pela etapa/situação, não pela escolha do vendedor. */
export const TEMP_GANHO = { value: "ganho", label: "Ganho", dot: "bg-success", card: "bg-temp-ganho" } as const;
export const TEMP_PERDIDO = { value: "perdido", label: "Perdido", dot: "bg-muted-foreground", card: "bg-temp-perdido" } as const;

export function classeTemperatura(v: unknown): string | null {
  const t = TEMPERATURAS.find((x) => x.value === String(v ?? "").toLowerCase().trim());
  return t ? t.card : null;
}

const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Ativação/ganha vira "Ganho" (verde); perdida/reprovada/desistência vira "Perdido" (cinza); senão a temperatura escolhida. */
export function temperaturaEfetiva(situacao: unknown, temperatura: unknown, etapa?: unknown) {
  const s = `${norm(situacao)} ${norm(etapa)}`;
  if (/ativa|ganh|aprovad/.test(s)) return TEMP_GANHO;
  if (/perd|reprov|desist|cancel/.test(s)) return TEMP_PERDIDO;
  return TEMPERATURAS.find((x) => x.value === norm(temperatura)) ?? null;
}

const on = (v: unknown) => v === true || v === 1 || ["true", "t", "1"].includes(String(v ?? ""));
/** Parâmetros do quadro; quando a coluna ainda não existe, quadros de Ofertas assumem ligado. */
export function opcoesQuadro(kanban: Record<string, unknown> | null | undefined, quadroOfertas: boolean) {
  const v = (k: string) => (kanban && k in kanban && kanban[k] !== null ? on(kanban[k]) : quadroOfertas);
  return { totais: v("exibir_totais"), temperatura: v("habilitar_temperatura") };
}

/** Soma o valor de cada oferta: implantação + mensalidade. */
export function valorOferta(o: Record<string, unknown>): number {
  const n = (x: unknown) => Number(x ?? 0) || 0;
  return n(o["total_liquido"]) + n(o["total_recorrente"]);
}
