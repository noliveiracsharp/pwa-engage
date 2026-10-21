import { describe, expect, it } from "vitest";
import { entradasDoPedido } from "./estoque";

describe("recebimento do pedido de compra", () => {
  it("dá entrada só nos itens que controlam estoque, com custo do pedido", () => {
    const r = entradasDoPedido([
      { item_id: "camera", quantidade: 4, preco_unitario: 250 },
      { item_id: "servico", quantidade: 1, preco_unitario: 500 },
    ], new Set(["camera"]));
    expect(r).toEqual([{ item_id: "camera", quantidade: 4, custo_unitario: 250 }]);
  });
  it("soma linhas repetidas e usa custo médio", () => {
    const r = entradasDoPedido([
      { item_id: "cabo", quantidade: 2, preco_unitario: 10 },
      { item_id: "cabo", quantidade: 2, preco_unitario: 20 },
    ], new Set(["cabo"]));
    expect(r).toEqual([{ item_id: "cabo", quantidade: 4, custo_unitario: 15 }]);
  });
});
