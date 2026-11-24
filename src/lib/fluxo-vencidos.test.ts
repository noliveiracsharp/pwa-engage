import { describe, expect, it } from "vitest";
import { fluxoPeriodo } from "./financeiro";

describe("fluxo de caixa com vencidos", () => {
  const t = [
    { tipo: "receber", status: "aberto", vencimento: "2026-11-10", valor: 51336.89 },
    { tipo: "pagar", status: "aberto", vencimento: "2026-11-28", valor: 8284.06 },
  ];
  it("título vencido em aberto entra no mês atual", () => {
    const l = fluxoPeriodo(t, { de: "2026-11-01", ate: "2027-10-31", modo: "previsto", hoje: "2026-11-24" });
    expect(l[0]).toMatchObject({ mes: "2026-11", entradas: 51336.89, saidas: 8284.06 });
  });
  it("período que começa no futuro joga vencidos para o primeiro mês", () => {
    const l = fluxoPeriodo(t, { de: "2027-01-01", ate: "2027-03-31", modo: "previsto", hoje: "2026-11-24" });
    expect(l[0]?.entradas).toBe(51336.89);
  });
});
