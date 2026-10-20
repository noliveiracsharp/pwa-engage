import { describe, it, expect } from "vitest";
import { projecaoMensal } from "./controller";

describe("projecaoMensal", () => {
  it("acumula saldo até dezembro e ignora pagos", () => {
    const t = [
      { tipo: "receber", status: "aberto", valor: 1000, vencimento: "2026-11-10" },
      { tipo: "pagar", status: "aberto", valor: 300, vencimento: "2026-12-05" },
      { tipo: "pagar", status: "pago", valor: 999, vencimento: "2026-12-05" },
      { tipo: "pagar", status: "aberto", valor: 100, vencimento: "2026-09-01" },
    ];
    const p = projecaoMensal(t, 500, "2026-10-20", 3);
    expect(p.map((m) => m.mes)).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(p[0].saldoFinal).toBe(400);
    expect(p[2].saldoFinal).toBe(1100);
  });
});
