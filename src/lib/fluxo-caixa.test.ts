import { describe, expect, it } from "vitest";
import { fluxoCaixaMensal } from "@/lib/fluxo-caixa";
import type { DreLinha } from "@/lib/dre-ofertas";

const linha = (p: Partial<DreLinha>): DreLinha => ({
  id: "1", bruto: 0, desconto: 0, liquido: 0, custo: 0, imposto: 0, despesas: 0, comissoes: 0, resultado: 0, margem: 0, despesasPorCategoria: {}, ...p,
});

describe("fluxo de caixa projetado", () => {
  const o = {
    dt_orcamento: "2026-01-05",
    parcelas: [
      { numero: 1, vencimento: "2026-01-10", valor: 4000 },
      { numero: 2, vencimento: "2026-02-10", valor: 3000 },
      { numero: 3, vencimento: "2026-03-10", valor: 3000 },
    ],
    compra_condicao: { modo: "avista", primeira: "2026-01-10" },
  };
  const m = fluxoCaixaMensal([{ o, l: linha({ liquido: 10000, custo: 5000, imposto: 1000, comissoes: 500, despesas: 200 }) }]);

  it("entradas seguem os vencimentos do cliente", () => {
    expect(m.map((x) => x.entradas)).toEqual([4000, 3000, 3000, 0]);
  });
  it("fornecedor à vista sai todo no primeiro mês", () => {
    expect(m[0]!.fornecedores).toBe(5000);
  });
  it("impostos são pagos no mês seguinte ao recebimento", () => {
    expect(m.map((x) => x.impostos)).toEqual([0, 400, 300, 300]);
  });
  it("comissões acompanham o recebimento", () => {
    expect(m.map((x) => x.comissoes)).toEqual([200, 150, 150, 0]);
  });
  it("acumulado final é igual ao resultado", () => {
    expect(m[m.length - 1]!.acumulado).toBe(3300);
    expect(m[0]!.saldo).toBe(4000 - 5000 - 200 - 200);
  });
});
