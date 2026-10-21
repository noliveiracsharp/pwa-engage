import { describe, expect, it } from "vitest";
import { linhasOfertaDaInspecao, naoConformes } from "./laudo-oferta";

describe("oferta a partir da inspeção", () => {
  const linhas = [
    { conforme: true, item_id: "a", descricao_item: "Extintor" },
    { conforme: false, item_id: "b", descricao_item: "Bomba", observacao: "Vazando" },
    { conforme: false, item_id: null, descricao_item: "Quadro elétrico", observacao: "Revisar barramento" },
  ];
  const itens = new Map([["b", { preco_venda: 500, preco_custo: 200 }]]);

  it("leva só os itens não conformes", () => {
    expect(linhasOfertaDaInspecao(linhas, itens)).toHaveLength(2);
    expect(naoConformes(linhas)).toBe(2);
  });

  it("usa o preço de tabela do item cadastrado", () => {
    expect(linhasOfertaDaInspecao(linhas, itens)[0]!.valor_unitario).toBe(500);
  });

  it("tópico livre vira detalhe com a observação do técnico", () => {
    expect(linhasOfertaDaInspecao(linhas, itens)[1]!.detalhe).toBe("Quadro elétrico — Revisar barramento");
  });
});
