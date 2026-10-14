import { describe, expect, it } from "vitest";
import { condicaoCompraPadrao, cronogramaCompra } from "./orcamentos";

const cli = [
  { numero: 1, vencimento: "2026-01-10", valor: 4000 },
  { numero: 2, vencimento: "2026-02-10", valor: 3000 },
  { numero: 3, vencimento: "2026-03-10", valor: 3000 },
];

describe("cronogramaCompra", () => {
  it("espelha datas e proporção das parcelas do cliente", () => {
    const r = cronogramaCompra({ custo: 5000, condicao: condicaoCompraPadrao(), parcelasCliente: cli, dataPadrao: "2026-01-01" });
    expect(r.map((p) => p.valor)).toEqual([2000, 1500, 1500]);
    expect(r[1]!.vencimento).toBe("2026-02-10");
  });
  it("à vista paga tudo na data informada", () => {
    const r = cronogramaCompra({ custo: 5000, condicao: { ...condicaoCompraPadrao(), modo: "avista", primeira: "2026-01-05" }, parcelasCliente: cli, dataPadrao: "2026-01-01" });
    expect(r).toEqual([{ numero: 1, vencimento: "2026-01-05", valor: 5000 }]);
  });
  it("parcelado com fornecedor divide em N meses", () => {
    const r = cronogramaCompra({ custo: 1000, condicao: { ...condicaoCompraPadrao(), modo: "personalizado", parcelas: "4", primeira: "2026-01-15" }, parcelasCliente: cli, dataPadrao: "2026-01-01" });
    expect(r.map((p) => p.valor)).toEqual([250, 250, 250, 250]);
    expect(r[3]!.vencimento).toBe("2026-04-15");
  });
});
