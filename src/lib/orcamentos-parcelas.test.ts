import { describe, expect, it } from "vitest";
import { calcEntrada, gerarParcelas } from "./orcamentos";

describe("parcelas com entrada", () => {
  it("40% de entrada em 10.000 em 10x: 4.000 + 9 parcelas do saldo", () => {
    const entrada = calcEntrada(10000, "percentual", "40");
    expect(entrada).toBe(4000);
    const p = gerarParcelas({ total: 10000, quantidade: 10, primeiraData: "2026-10-13", comJuros: false, entrada });
    expect(p[0]!.valor).toBe(4000);
    expect(p[1]!.valor).toBe(666.67);
    expect(p[9]!.valor).toBe(666.64);
    expect(p.reduce((s, x) => s + x.valor, 0)).toBeCloseTo(10000, 2);
  });

  it("parcela fixada à mão: o saldo é rateado nas demais", () => {
    const p = gerarParcelas({ total: 10000, quantidade: 4, primeiraData: "2026-10-13", comJuros: false, entrada: 4000, fixas: { 2: 2000 } });
    expect(p.map((x) => x.valor)).toEqual([4000, 2000, 2000, 2000]);
  });
});
