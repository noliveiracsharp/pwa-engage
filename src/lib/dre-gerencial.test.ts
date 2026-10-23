import { describe, expect, it } from "vitest";
import { apurarDre } from "./dre-gerencial";

const contas = [
  { id: "r", codigo: "3.1", descricao: "Vendas", natureza: "receita" },
  { id: "d", codigo: "4.1", descricao: "Aluguel", natureza: "despesa" },
];
const f = { inicio: "2026-01-01", fim: "2026-12-31", regime: "competencia" as const };

describe("DRE gerencial", () => {
  it("receita menos despesa classificadas dá o resultado", () => {
    const t = [
      { id: "1", tipo: "receber", valor: 1000, data_competencia: "2026-03-10", status: "aberto" },
      { id: "2", tipo: "pagar", valor: 300, data_competencia: "2026-03-15", status: "aberto" },
    ];
    const i = [{ titulo_id: "1", valor: 1000, plano_contas_id: "r" }, { titulo_id: "2", valor: 300, plano_contas_id: "d" }];
    const a = apurarDre(t, i, contas, f);
    expect(a.receitaLiquida).toBe(1000);
    expect(a.despesas).toBe(300);
    expect(a.resultadoLiquido).toBe(700);
  });
  it("linhas sem conta ficam como não classificadas e fora do resultado", () => {
    const t = [{ id: "1", tipo: "pagar", valor: 200, data_competencia: "2026-02-01" }];
    const a = apurarDre(t, [], contas, f);
    expect(a.naoClassificado.pagar).toBe(200);
    expect(a.resultadoLiquido).toBe(0);
  });
  it("regime de caixa usa só o valor pago na data do pagamento", () => {
    const t = [{ id: "1", tipo: "receber", valor: 1000, valor_pago: 400, pago_em: "2026-05-02", data_competencia: "2025-12-01" }];
    const a = apurarDre(t, [{ titulo_id: "1", valor: 1000, plano_contas_id: "r" }], contas, { ...f, regime: "caixa" });
    expect(a.receitaBruta).toBe(400);
  });
  it("cancelados não entram", () => {
    const t = [{ id: "1", tipo: "receber", valor: 1000, data_competencia: "2026-03-10", status: "cancelado" }];
    expect(apurarDre(t, [{ titulo_id: "1", valor: 1000, plano_contas_id: "r" }], contas, f).receitaBruta).toBe(0);
  });
});
