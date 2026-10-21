import { describe, expect, it } from "vitest";
import { compararVersoes, rotuloVersao } from "./oferta-versoes";

const v1 = { orcamento: { total_liquido: 23147.5, total_recorrente: 2596.04 }, itens: [
  { item_id: "a", quantidade: 1, valor_unitario: 1000 },
  { item_id: "cftv", quantidade: 2, valor_unitario: 500 },
] };
const v2 = { orcamento: { total_liquido: 21990, total_recorrente: 2596.04 }, itens: [
  { item_id: "a", quantidade: 3, valor_unitario: 1000 },
  { item_id: "novo", quantidade: 1, valor_unitario: 10 },
] };

describe("versões da Oferta", () => {
  it("detecta item removido, adicionado e alterado", () => {
    const d = compararVersoes(v1, v2);
    expect(d.itens.find((i) => i.chave.startsWith("cftv"))?.tipo).toBe("removido");
    expect(d.itens.find((i) => i.chave.startsWith("novo"))?.tipo).toBe("adicionado");
    expect(d.itens.find((i) => i.chave.startsWith("a|"))?.tipo).toBe("alterado");
  });
  it("mostra só os totais que mudaram, com a diferença", () => {
    const d = compararVersoes(v1, v2);
    expect(d.campos).toEqual([{ campo: "total_liquido", rotulo: "Implantação / total", antes: 23147.5, depois: 21990, delta: -1157.5 }]);
  });
  it("versões idênticas não têm diferença", () => {
    expect(compararVersoes(v1, v1).igual).toBe(true);
  });
  it("revisão sem número vira Rev. 1", () => {
    expect(rotuloVersao(null)).toBe("Rev. 1");
    expect(rotuloVersao(3)).toBe("Rev. 3");
  });
});
