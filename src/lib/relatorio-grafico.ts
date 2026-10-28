/** Configuração de gráfico de um relatório. Gravada como um filtro especial (campo "__grafico") para não exigir nova coluna. */
export type TipoGrafico = "barras" | "colunas" | "pizza" | "rosca" | "linha" | "area";
export const TIPOS_GRAFICO: { value: TipoGrafico; label: string }[] = [
  { value: "area", label: "Área (evolução acumulada)" },
  { value: "barras", label: "Barras (ranking)" },
  { value: "colunas", label: "Colunas (comparação)" },
  { value: "linha", label: "Linha (evolução no tempo)" },
  { value: "pizza", label: "Pizza (proporção)" },
  { value: "rosca", label: "Rosca (proporção)" },
];
export const ehTipoGrafico = (v: unknown): v is TipoGrafico => TIPOS_GRAFICO.some((t) => t.value === v);

export type GraficoConfig = {
  tipo: TipoGrafico;
  /** Campo (achatado, ex.: "itens.nome") que define as categorias. */
  agrupar: string;
  /** Campo opcional que separa séries (ex.: "natureza" → produto / serviço). */
  separar?: string | undefined;
  /** "contagem" ou nome de campo numérico para somar (ex.: "quantidade"). */
  medida: string;
  /** Quando "agrupar" é uma data: agrupa por dia, mês ou ano, em ordem cronológica. */
  periodo?: "dia" | "mes" | "ano" | undefined;
  limite?: number;
};

export const CAMPO_GRAFICO = "__grafico";

type F = { campo: string; operador: string; valor: string };

export function extrairGrafico<T extends F>(filtros: T[]): { grafico: GraficoConfig | null; filtros: T[] } {
  const g = filtros.find((f) => f.campo === CAMPO_GRAFICO);
  let grafico: GraficoConfig | null = null;
  if (g) {
    try { grafico = JSON.parse(g.valor) as GraficoConfig; } catch { grafico = null; }
  }
  return { grafico: grafico?.agrupar ? grafico : null, filtros: filtros.filter((f) => f.campo !== CAMPO_GRAFICO) };
}

export function filtroGrafico(g: GraficoConfig): F {
  return { campo: CAMPO_GRAFICO, operador: "grafico", valor: JSON.stringify(g) };
}

const rotulo = (v: unknown) => (v === null || v === undefined || v === "" ? "(sem valor)" : String(v));
const TAM = { dia: 10, mes: 7, ano: 4 } as const;

/** Agrupa linhas em categorias × séries. Por período: ordem cronológica; senão ordena pelo total e limita (padrão 15). */
export function agregar(rows: Record<string, unknown>[], g: GraficoConfig) {
  const series = new Set<string>();
  const mapa = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const bruto = r[g.agrupar];
    const cat = g.periodo && bruto ? String(bruto).slice(0, TAM[g.periodo]) : rotulo(bruto);
    const ser = g.separar ? rotulo(r[g.separar]) : "Total";
    series.add(ser);
    const n = g.medida === "contagem" ? 1 : Number(r[g.medida]) || 0;
    const o = mapa.get(cat) ?? {};
    o[ser] = (o[ser] ?? 0) + n;
    mapa.set(cat, o);
  }
  const lista = [...series].sort();
  const base = [...mapa.entries()].map(([nome, v]) => ({ nome, ...v, _total: Object.values(v).reduce((a, b) => a + b, 0) }));
  const dados = g.periodo
    ? base.sort((a, b) => a.nome.localeCompare(b.nome)).slice(-(g.limite ?? 60))
    : base.sort((a, b) => b._total - a._total).slice(0, g.limite ?? 15);
  return { dados, series: lista };
}

/** Filtros em campos de relação ("tabela.coluna") são aplicados depois de achatar as linhas. */
export function aplicarFiltrosRelacao<T extends F>(rows: Record<string, unknown>[], filtros: T[]) {
  const rel = filtros.filter((f) => f.campo.includes("."));
  if (!rel.length) return rows;
  const norm = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return rows.filter((r) => rel.every((f) => {
    const v = r[f.campo];
    const alvo = String(f.valor).replace(/^%|%$/g, "");
    if (f.operador === "ilike") return norm(v).includes(norm(alvo));
    if (f.operador === "eq") return norm(v) === norm(alvo);
    if (f.operador === "neq") return norm(v) !== norm(alvo);
    if (f.operador === "gt") return Number(v) > Number(alvo) || String(v) > alvo;
    if (f.operador === "lt") return Number(v) < Number(alvo) || String(v) < alvo;
    return true;
  }));
}
