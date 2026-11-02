import { describe, expect, it } from "vitest";
import { totaisDasLinhas } from "./orcamento-totais-auto";

describe("totaisDasLinhas", () => {
  it("soma o valor do item no total da Oferta (não fica R$ 0)", () => {
    const t = totaisDasLinhas([{ total_linha: 1263.16, custo_total: 500, imposto_valor: 0 }]);
    expect(t.total_liquido).toBe(1263.16);
    expect(t.total_itens).toBe(1263.16);
    expect(t.total_lucro).toBe(763.16);
  });
  it("itens inclusos não entram no total", () => {
    expect(totaisDasLinhas([{ total_linha: 100, custo_total: 0, imposto_valor: 0 }, { total_linha: 50, custo_total: 0, imposto_valor: 0, incluso: true }]).total_liquido).toBe(100);
  });
});
