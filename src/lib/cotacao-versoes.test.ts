import { describe, expect, it } from "vitest";
import { compararCotacoes, snapshotCotacao } from "./cotacao-versoes";

const itens = [{ id: "c1", item_id: "A", quantidade: 2 }, { id: "c2", item_id: "B", quantidade: 5 }];
describe("versões de cotação", () => {
  it("revisão idêntica não tem alterações", () => {
    const s = snapshotCotacao(itens, [{ cotacao_item_id: "c1", fornecedor_id: "F", preco_unitario: 10 }]);
    expect(compararCotacoes(s, s).igual).toBe(true);
  });
  it("detecta item incluído, removido e quantidade alterada", () => {
    const a = snapshotCotacao(itens, []);
    const b = snapshotCotacao([{ id: "c1", item_id: "A", quantidade: 3 }, { id: "c3", item_id: "C", quantidade: 1 }], []);
    const tipos = compararCotacoes(a, b).itens.map((i) => `${i.item_id}:${i.tipo}`).sort();
    expect(tipos).toEqual(["A:alterado", "B:removido", "C:adicionado"]);
  });
  it("mudança só de preço do fornecedor conta como alteração", () => {
    const a = snapshotCotacao(itens, [{ cotacao_item_id: "c1", fornecedor_id: "F", preco_unitario: 10 }]);
    const b = snapshotCotacao(itens, [{ cotacao_item_id: "c1", fornecedor_id: "F", preco_unitario: 9 }]);
    expect(compararCotacoes(a, b).igual).toBe(false);
  });
});
