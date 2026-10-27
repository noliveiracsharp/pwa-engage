/** Regras puras de precificação e controladoria. */
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export type HoraTecnica = {
  salario: number;
  encargosPct: number; // encargos trabalhistas sobre o salário
  beneficios: number; // R$/mês
  horasMes: number; // jornada contratada
  eficienciaPct: number; // % do tempo realmente faturável
};

/** Custo de uma hora faturável: (salário + encargos + benefícios) ÷ (horas × eficiência). */
export function custoHoraTecnica(h: HoraTecnica): number | null {
  const horas = h.horasMes * (h.eficienciaPct / 100);
  if (!(horas > 0) || !(h.salario > 0)) return null;
  const mensal = h.salario * (1 + h.encargosPct / 100) + h.beneficios;
  return r2(mensal / horas);
}

/** Custo do serviço = horas estimadas × custo/hora + deslocamento/insumos. */
export function custoServico(horas: number, custoHora: number, extras: number): number {
  return r2(Math.max(0, horas) * Math.max(0, custoHora) + Math.max(0, extras));
}

/**
 * Ponto de equilíbrio: despesas fixas ÷ margem de contribuição %.
 * Margem de contribuição = receita líquida − custos variáveis.
 */
export function pontoEquilibrio(receitaLiquida: number, custosVariaveis: number, despesasFixas: number) {
  const mc = r2(receitaLiquida - custosVariaveis);
  const mcPct = receitaLiquida > 0 ? r2((mc / receitaLiquida) * 100) : 0;
  const pe = mcPct > 0 ? r2(despesasFixas / (mcPct / 100)) : null;
  return { mc, mcPct, pe };
}
