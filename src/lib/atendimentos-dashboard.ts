/** Métricas puras do Dashboard gerencial de Atendimentos. */
export type ItemMetrica = {
  atendente: string; departamento: string; nota: number; encerrado: boolean;
  duracaoMin: number | null; sla: "sem_sla" | "ok" | "atencao" | "estourado" | null;
};
export type Metricas = {
  total: number; encerrados: number; avaliados: number; mediaNota: number;
  tempoMedioMin: number | null; comSla: number; slaCumprido: number; pctSla: number | null;
};

export function calcularMetricas(itens: ItemMetrica[]): Metricas {
  const enc = itens.filter((i) => i.encerrado);
  const av = enc.filter((i) => i.nota > 0);
  const dur = enc.map((i) => i.duracaoMin).filter((d): d is number => d !== null && d >= 0);
  const comSla = itens.filter((i) => !i.encerrado && i.sla && i.sla !== "sem_sla");
  const ok = comSla.filter((i) => i.sla !== "estourado").length;
  return {
    total: itens.length, encerrados: enc.length, avaliados: av.length,
    mediaNota: av.length ? av.reduce((s, i) => s + i.nota, 0) / av.length : 0,
    tempoMedioMin: dur.length ? dur.reduce((s, d) => s + d, 0) / dur.length : null,
    comSla: comSla.length, slaCumprido: ok, pctSla: comSla.length ? (ok / comSla.length) * 100 : null,
  };
}

export function agruparPor(itens: ItemMetrica[], chave: "atendente" | "departamento") {
  const g = new Map<string, ItemMetrica[]>();
  for (const i of itens) g.set(i[chave], [...(g.get(i[chave]) ?? []), i]);
  return [...g.entries()].map(([nome, l]) => ({ nome, ...calcularMetricas(l) })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
