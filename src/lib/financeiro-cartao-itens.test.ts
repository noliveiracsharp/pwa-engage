import { describe, expect, it } from "vitest";
import { parcelasItensCartao } from "./financeiro";

describe("cartão item a item", () => {
  const opts = { dataCompra: "2026-10-19", diaFechamento: 10, diaVencimento: 25 };
  it("dois itens em 1 parcela viram duas compras independentes de 1/1", () => {
    const p = parcelasItensCartao([
      { descricao: "Super frete", categoria: "", valor: 25.29, parcelas: 1 },
      { descricao: "Contador", categoria: "", valor: 209, parcelas: 1 },
    ], opts);
    expect(p.map((x) => [x.grupo, x.n, x.total])).toEqual([[0, 1, 1], [1, 1, 1]]);
  });
  it("cada item usa a própria data da compra", () => {
    const p = parcelasItensCartao([
      { descricao: "A", categoria: "", valor: 10, parcelas: 1, dataCompra: "2026-10-05" },
      { descricao: "B", categoria: "", valor: 10, parcelas: 1, dataCompra: "2026-10-15" },
    ], opts);
    expect(p.map((x) => x.dataCompra)).toEqual(["2026-10-05", "2026-10-15"]);
    expect(p[0]!.vencimento < p[1]!.vencimento).toBe(true);
  });
});
