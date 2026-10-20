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

import { serieParcelas, vencParcela1De } from "./financeiro";
describe("serieParcelas começando no meio", () => {
  it("2/10 com histórico: valor exato e 1/10 um mês antes", () => {
    const s = serieParcelas({ total: 10, inicio: 2, valorParcela: 504.92, incluirAnteriores: true, vencParcela1: "2026-09-25" });
    expect(s.length).toBe(10);
    expect(s.every((p) => p.valor === 504.92)).toBe(true);
    expect(s[0]).toMatchObject({ n: 1, vencimento: "2026-09-25", anterior: true });
    expect(s[1]).toMatchObject({ n: 2, vencimento: "2026-10-25", anterior: false });
    expect(s[9]!.vencimento).toBe("2027-06-25");
  });
  it("sem histórico gera só 2 a 10", () => {
    const s = serieParcelas({ total: 10, inicio: 2, valorParcela: 504.92, vencParcela1: "2026-09-25" });
    expect(s.map((p) => p.n)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it("parcela 1 deduzida do vencimento atual", () => {
    expect(vencParcela1De("2026-10-25", 2)).toBe("2026-09-25");
  });
});
