/** Totais do cabeçalho calculados a partir das linhas (usado quando quem salva não informa). */
export type LinhaTotal = { total_linha: number; custo_total: number; imposto_valor: number; incluso?: boolean | undefined };

export function totaisDasLinhas(linhas: LinhaTotal[]) {
  const validas = linhas.filter((l) => !l.incluso);
  const r = (n: number) => Math.round(n * 100) / 100;
  const total = r(validas.reduce((s, l) => s + (Number(l.total_linha) || 0), 0));
  const custo = r(validas.reduce((s, l) => s + (Number(l.custo_total) || 0), 0));
  const imposto = r(validas.reduce((s, l) => s + (Number(l.imposto_valor) || 0), 0));
  const lucro = r(total - custo - imposto);
  return {
    total_itens: total, desconto_valor: 0, total_liquido: total, total_custo: custo,
    total_imposto: imposto, total_lucro: lucro, margem_pct: total > 0 ? r((lucro / total) * 100) : 0,
  };
}

/** Tipo do modelo que guarda a estrutura completa da Oferta digital padrão da empresa. */
export const TIPO_MODELO_PADRAO = "PADRAO_OFERTA";
