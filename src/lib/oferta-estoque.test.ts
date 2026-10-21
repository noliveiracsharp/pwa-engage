import { describe, expect, it } from "vitest";
import { documentoEstoqueOferta, movimentosEstoqueDaOferta } from "./oferta-ativacao";

const controla = new Set(["camera", "cabo"]);

describe("baixa de estoque na ativação da Oferta", () => {
  it("baixa só produtos que controlam estoque", () => {
    const r = movimentosEstoqueDaOferta([
      { item_id: "camera", natureza: "produto", quantidade: 4, preco_custo: 250 },
      { item_id: "parafuso", natureza: "produto", quantidade: 10 },
      { item_id: "instalacao", natureza: "servico", quantidade: 1 },
    ], controla);
    expect(r).toEqual([{ item_id: "camera", quantidade: 4, custo_unitario: 250 }]);
  });
  it("não baixa serviço mensal mesmo com o item controlando estoque", () => {
    expect(movimentosEstoqueDaOferta([{ item_id: "cabo", natureza: "recorrente", quantidade: 3 }], controla)).toEqual([]);
  });
  it("soma linhas repetidas do mesmo produto e ignora quantidade zero", () => {
    const r = movimentosEstoqueDaOferta([
      { item_id: "cabo", natureza: "produto", quantidade: 2 },
      { item_id: "cabo", natureza: "produto", quantidade: 3 },
      { item_id: "camera", natureza: "produto", quantidade: 0 },
    ], controla);
    expect(r).toEqual([{ item_id: "cabo", quantidade: 5, custo_unitario: null }]);
  });
  it("documento identifica a Oferta pelo número", () => {
    expect(documentoEstoqueOferta("#2026-15", "abc")).toBe("Oferta #2026-15");
  });
});
