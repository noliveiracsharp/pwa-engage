/** Configuração de gráfico de um relatório. Gravada como um filtro especial (campo "__grafico") para não exigir nova coluna. */
export type GraficoConfig = {
  tipo: "barras" | "pizza";
  /** Campo (achatado, ex.: "itens.nome") que define as categorias. */
  agrupar: string;
  /** Campo opcional que separa séries (ex.: "natureza" → produto / serviço). */
  separar?: string | undefined;
  /** "contagem" ou nome de campo numérico para somar (ex.: "quantidade"). */
  medida: string;
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

/** Agrupa linhas em categorias × séries, ordena pelo total e limita (padrão 15). */
export function agregar(rows: Record<string, unknown>[], g: GraficoConfig) {
  const series = new Set<string>();
  const mapa = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const cat = rotulo(r[g.agrupar]);
    const ser = g.separar ? rotulo(r[g.separar]) : "Total";
    series.add(ser);
    const n = g.medida === "contagem" ? 1 : Number(r[g.medida]) || 0;
    const o = mapa.get(cat) ?? {};
    o[ser] = (o[ser] ?? 0) + n;
    mapa.set(cat, o);
  }
  const lista = [...series].sort();
  const dados = [...mapa.entries()]
    .map(([nome, v]) => ({ nome, ...v, _total: Object.values(v).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b._total - a._total)
    .slice(0, g.limite ?? 15);
  return { dados, series: lista };
}
