import { describe, expect, it } from "vitest";
import { fluxoPeriodo, periodoVisao } from "./financeiro";

const t = [
  { tipo: "receber", status: "pago", valor: 100, valor_pago: 110, pago_em: "2026-10-05", vencimento: "2026-10-01" },
  { tipo: "pagar", status: "aberto", valor: 40, vencimento: "2026-11-10" },
  { tipo: "receber", status: "aberto", valor: 50, vencimento: "2026-10-20" },
  { tipo: "pagar", status: "cancelado", valor: 999, vencimento: "2026-10-20" },
];

describe("periodoVisao", () => {
  it("mês atual", () => expect(periodoVisao("mes", "2026-10-17")).toEqual({ de: "2026-10-01", ate: "2026-10-31" }));
  it("6 meses = atual e 5 seguintes", () => expect(periodoVisao("6m", "2026-10-17")).toEqual({ de: "2026-10-01", ate: "2027-03-31" }));
  it("12 meses", () => expect(periodoVisao("12m", "2026-10-17").ate).toBe("2027-09-30"));
});

describe("fluxoPeriodo", () => {
  const p = { de: "2026-10-01", ate: "2026-11-30" };
  it("realizado só conta baixas pelo valor pago", () => {
    const r = fluxoPeriodo(t, { ...p, modo: "realizado" });
    expect(r[0]).toMatchObject({ mes: "2026-10", entradas: 110, saidas: 0 });
    expect(r[1]).toMatchObject({ entradas: 0, saidas: 0 });
  });
  it("previsto só conta em aberto e ignora cancelado", () => {
    const r = fluxoPeriodo(t, { ...p, modo: "previsto" });
    expect(r[0]).toMatchObject({ entradas: 50, saidas: 0 });
    expect(r[1]).toMatchObject({ saidas: 40 });
  });
  it("ambos acumula a partir do saldo inicial", () => {
    const r = fluxoPeriodo(t, { ...p, modo: "ambos", saldoInicial: 10 });
    expect(r.map((m) => m.acumulado)).toEqual([170, 130]);
  });
});
