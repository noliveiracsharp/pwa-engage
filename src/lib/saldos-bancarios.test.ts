import { describe, expect, it } from "vitest";
import { contasDaEmpresa, saldoConsultado, somarSaldos } from "./saldos-bancarios";

describe("saldos bancários", () => {
  it("soma os saldos das contas incluindo saldo negativo e zero", () => {
    expect(somarSaldos([100.1, -20.05, 0].map((saldo_atual) => ({ saldo_atual, saldo_consultado_em: "2026-10-22" })))).toEqual({ total: 80.05, consultadas: 3, pendentes: 0 });
  });
  it("não transforma saldo indisponível em zero e identifica total parcial", () => {
    expect(somarSaldos([{ saldo_atual: 80, saldo_consultado_em: "2026-10-22" }, { saldo_atual: 900 }])).toEqual({ total: 80, consultadas: 1, pendentes: 1 });
    expect(somarSaldos([{}]).total).toBeNull();
    expect(saldoConsultado({ saldo_atual: null, saldo_consultado_em: "2026-10-22" })).toBeNull();
  });
  it("somente inclui bancos da empresa ativa, nunca de outra ou sem empresa", () => {
    const contas = [{ id: "1", empresa_id: "a" }, { id: "2", empresa_id: "b" }, { id: "3", empresa_id: null }];
    expect(contasDaEmpresa(contas, "a").map((c) => c["id"])).toEqual(["1"]);
    expect(contasDaEmpresa(contas, "")).toEqual([]);
  });
});