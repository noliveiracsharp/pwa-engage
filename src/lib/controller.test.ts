import { describe, expect, it } from "vitest";
import { burnRate, categoriasEmAlta, diagnosticar, inadimplencia, prazoMedio, rupturaCaixa, runwayMeses } from "./controller";

const H = "2026-10-15";

describe("controller", () => {
  it("detecta ruptura no dia em que o saldo fica negativo", () => {
    const t = [
      { tipo: "pagar", status: "aberto", valor: 800, vencimento: "2026-10-20" },
      { tipo: "pagar", status: "aberto", valor: 500, vencimento: "2026-10-25" },
    ];
    expect(rupturaCaixa(t, 1000, H)).toEqual({ data: "2026-10-25", saldo: -300 });
    expect(rupturaCaixa(t, 2000, H)).toBeNull();
  });
  it("burn rate é a média de 3 meses fechados e runway divide o saldo", () => {
    const t = ["2026-07-10", "2026-08-10", "2026-09-10"].map((d) => ({ tipo: "pagar", status: "pago", valor: 3000, pago_em: d }));
    expect(burnRate(t, H)).toBe(3000);
    expect(runwayMeses(6000, 3000)).toBe(2);
  });
  it("inadimplência soma vencidos a receber e ordena devedores", () => {
    const t = [
      { tipo: "receber", status: "aberto", valor: 100, vencimento: "2026-10-01", n: "A" },
      { tipo: "receber", status: "aberto", valor: 400, vencimento: "2026-10-02", n: "B" },
      { tipo: "receber", status: "aberto", valor: 999, vencimento: "2026-11-01", n: "C" },
    ];
    const r = inadimplencia(t, (x) => String(x["n"]), H);
    expect(r.total).toBe(500);
    expect(r.top[0]).toEqual({ nome: "B", valor: 400 });
  });
  it("prazo médio ponderado por valor", () => {
    expect(prazoMedio([{ tipo: "receber", status: "pago", valor: 100, data_competencia: "2026-01-01", pago_em: "2026-01-31" }], "receber")).toBe(30);
  });
  it("categoria 30% acima da média vira alerta", () => {
    const hist = ["2026-07-05", "2026-08-05", "2026-09-05"].map((d) => ({ tipo: "pagar", status: "pago", valor: 100, pago_em: d, categoria: "Software" }));
    const r = categoriasEmAlta([...hist, { tipo: "pagar", status: "pago", valor: 200, pago_em: "2026-10-05", categoria: "Software" }], H);
    expect(r[0]).toMatchObject({ categoria: "Software", atual: 200, media: 100 });
  });
  it("sem riscos retorna alerta ok", () => {
    expect(diagnosticar([], 1000, () => "", H).alertas[0]?.nivel).toBe("ok");
  });
});
