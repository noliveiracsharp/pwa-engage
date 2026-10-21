import { pick, type Row } from "@/lib/row";

/** Itens da inspeção que viram linhas da Oferta: apenas os Não Conformes. */
export function linhasOfertaDaInspecao(linhasLaudo: Row[], itensPorId: Map<string, Row>) {
  return linhasLaudo
    .filter((l) => l["conforme"] === false)
    .map((l, i) => {
      const itemId = l["item_id"] ? String(l["item_id"]) : null;
      const item = itemId ? itensPorId.get(itemId) : undefined;
      const valor = Number(pick(item ?? {}, ["preco_venda", "valor_venda", "preco"]) ?? 0) || 0;
      const custo = Number(pick(item ?? {}, ["preco_custo", "custo"]) ?? 0) || 0;
      const obs = String(l["observacao"] ?? "").trim();
      const desc = String(l["descricao_item"] ?? "").trim();
      const detalhe = itemId ? obs || null : [desc, obs].filter(Boolean).join(" — ") || null;
      return {
        ordem: i + 1,
        item_id: itemId,
        detalhe,
        quantidade: 1,
        unidade_medida_id: (item?.["unidade_medida_id"] as string | undefined) ?? null,
        valor_unitario: valor,
        total_linha: valor,
        preco_custo: custo,
        imposto_pct: 0,
        imposto_valor: 0,
        custo_total: custo,
        lucro: valor - custo,
        margem_pct: valor > 0 ? ((valor - custo) / valor) * 100 : 0,
        natureza: "servico",
      };
    });
}

export const naoConformes = (linhasLaudo: Row[]) => linhasLaudo.filter((l) => l["conforme"] === false).length;
