export type FiltrosItens = { busca: string; tipos: string[]; categoria: string; status: string };
export const FILTROS_ITENS: FiltrosItens = { busca: "", tipos: [], categoria: "todos", status: "todos" };

export function parametrosItens(f: FiltrosItens, pagina = 1, tamanho = 50, ordem = "descricao", direcao = "asc") {
  return {
    p_busca: f.busca.trim(), p_tipos: f.tipos, p_categoria: f.categoria,
    p_status: f.status, p_limite: tamanho, p_offset: (Math.max(1, pagina) - 1) * tamanho,
    p_ordem: ordem, p_direcao: direcao,
  };
}