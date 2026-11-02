import { pick, type Row } from "@/lib/row";

/** Linha de Oferta a partir de um item do catálogo (preço e custo de tabela). */
export function linhaOfertaDoItem(item: Row) {
  const valor = Number(pick(item, ["preco_venda", "valor_venda", "preco"]) ?? 0) || 0;
  const custo = Number(pick(item, ["preco_custo", "custo"]) ?? 0) || 0;
  return {
    ordem: 1, item_id: String(item["id"]), descricao: String(item["descricao"] ?? "Item"), quantidade: 1,
    unidade_medida_id: (item["unidade_medida_id"] as string | undefined) ?? null,
    valor_unitario: valor, total_linha: valor, preco_custo: custo, imposto_pct: 0, imposto_valor: 0,
    custo_total: custo, lucro: valor - custo, margem_pct: valor > 0 ? ((valor - custo) / valor) * 100 : 0,
    natureza: "servico", detalhe: null,
  };
}

/** Mensagem do WhatsApp com a Oferta (formatação nativa do WhatsApp). */
export function mensagemOfertaChat(d: { nome: string; numero: string; total: number; link: string }) {
  const total = d.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return [
    `Olá ${d.nome}! Segue a Oferta *${d.numero}* no valor de *${total}*.`,
    d.link ? `Para ver os detalhes e aprovar online: ${d.link}` : "Qualquer dúvida estou à disposição.",
  ].join("\n\n");
}
