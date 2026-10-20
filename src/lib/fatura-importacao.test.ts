import { describe, expect, it } from "vitest";
import { ehDespesa, limparDescricao, parcelasDaLinha } from "./fatura-importacao";

const base = { final4: "8385", data: "2025-11-06", credito: false };

describe("importação de fatura em PDF", () => {
  it("12 de 12 cai na fatura importada e as 11 anteriores voltam no tempo", () => {
    const p = parcelasDaLinha({ ...base, descricao: "MERCADOLIVRE (Parcela 12 de 12)", valor: 114.47, parcela: 12, de: 12 }, "2026-10-25", true);
    expect(p.length).toBe(12);
    expect(p[11]).toMatchObject({ n: 12, vencimento: "2026-10-25", valor: 114.47, anterior: false });
    expect(p[0]).toMatchObject({ n: 1, vencimento: "2025-11-25", anterior: true });
  });
  it("2 de 10 lança a 2ª nesta fatura e a 10ª em junho", () => {
    const p = parcelasDaLinha({ ...base, descricao: "A S COM", valor: 894.14, parcela: 2, de: 10 }, "2026-10-25", false);
    expect(p.map((x) => x.n)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(p[0]!.vencimento).toBe("2026-10-25");
    expect(p[8]!.vencimento).toBe("2027-06-25");
  });
  it("compra à vista vira uma única conta na fatura", () => {
    expect(parcelasDaLinha({ ...base, descricao: "SUPERFRETE", valor: 13.73, parcela: null, de: null }, "2026-10-25", true))
      .toEqual([{ n: 1, total: 1, vencimento: "2026-10-25", valor: 13.73, anterior: false }]);
  });
  it("pagamento da fatura anterior não é lançado", () => {
    expect(ehDespesa({ ...base, descricao: "PAGAMENTO ON LINE", valor: 16460.24, parcela: null, de: null, credito: true })).toBe(false);
    expect(ehDespesa({ ...base, descricao: "PAGAMENTO ON LINE", valor: 16460.24, parcela: null, de: null })).toBe(false);
  });
  it("limpa o texto da parcela", () => {
    expect(limparDescricao("FACE SEG ITAQUAQUECET (Parcela 07 de 10)")).toBe("FACE SEG ITAQUAQUECET");
  });
});
