import { describe, expect, it } from "vitest";
import { planoTamanhoSerie } from "./financeiro-recorrencia";
const serie = (n: number, pagos = 0) => Array.from({ length: n }, (_, i) => ({ id: i + 1, descricao: `Vaga (${i + 1}/${n})`,
  vencimento: `2026-${String(i + 1).padStart(2, "0")}-31`.replace(/-02-31/, "-02-28"), valor: 120, status: i < pagos ? "pago" : "aberto" }));
describe("planoTamanhoSerie", () => {
  it("estende 12 para 30 criando 18 parcelas", () => {
    const p = planoTamanhoSerie(serie(12, 3), 30);
    expect(p.criar).toHaveLength(18);
    expect(p.criar[0]).toMatchObject({ parcela_n: 13, descricao: "Vaga (13/30)", vencimento: "2027-01-31", valor: 120 });
    expect(p.renomear[0]!.descricao).toBe("Vaga (1/30)");
  });
  it("reduz 12 para 6 removendo 6 em aberto", () => {
    expect(planoTamanhoSerie(serie(12), 6).remover).toHaveLength(6);
  });
  it("bloqueia redução que removeria parcela paga", () => {
    expect(planoTamanhoSerie(serie(12, 8), 6).bloqueio).toBeTruthy();
  });
});
