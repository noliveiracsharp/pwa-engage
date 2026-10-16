import { describe, expect, it } from "vitest";
import { parcelasCartao, vencimentoFatura } from "./financeiro";

describe("compra parcelada no cartão", () => {
  it("compra antes do fechamento (28) vence dia 10 do mês seguinte", () => {
    expect(vencimentoFatura("2026-10-15", 28, 10)).toBe("2026-11-10");
  });
  it("compra depois do fechamento pula uma fatura", () => {
    expect(vencimentoFatura("2026-10-29", 28, 10)).toBe("2026-12-10");
  });
  it("3x de R$ 3.000 vence 10/11, 10/12 e 10/01", () => {
    expect(parcelasCartao({ valor: 3000, parcelas: 3, dataCompra: "2026-10-15", diaFechamento: 28, diaVencimento: 10 })).toEqual([
      { vencimento: "2026-11-10", valor: 1000 },
      { vencimento: "2026-12-10", valor: 1000 },
      { vencimento: "2027-01-10", valor: 1000 },
    ]);
  });
  it("R$ 100 em 3x põe o centavo na 1ª parcela", () => {
    expect(parcelasCartao({ valor: 100, parcelas: 3, dataCompra: "2026-10-01", diaFechamento: 28, diaVencimento: 10 }).map((p) => p.valor)).toEqual([33.34, 33.33, 33.33]);
  });
});
