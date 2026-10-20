import { describe, expect, it } from "vitest";
import { valorEsperadoDoTitulo } from "./oferta-titulo-sync";
import { titulosDaOferta } from "./financeiro";

describe("vínculo Oferta ↔ Contas a Receber", () => {
  it("contrato manual de R$ 5.000 vinculado a Oferta com 3 mensais soma 5.000", () => {
    const oferta = { total_recorrente: 5000, total_liquido: 0 };
    expect(valorEsperadoDoTitulo({ origem_tipo: "manual", valor: 5000 }, oferta)).toBe(5000);
    expect(valorEsperadoDoTitulo({ origem_tipo: "manual", valor: 5000 }, { total_recorrente: 5200 })).toBe(5200);
  });
  it("parcela de implantação gerada pela Oferta não é sincronizada", () => {
    expect(valorEsperadoDoTitulo({ origem_tipo: "oferta", descricao: "Oferta #1 — Implantação 1/2" }, { total_recorrente: 5000 })).toBeNull();
  });
  it("ativação separa implantação e mensalidades", () => {
    const t = titulosDaOferta({
      id: "o", numero: "#1", total_recorrente: 5000, vigencia_meses: 12,
      parcelas: [{ numero: 1, vencimento: "2026-11-10", valor: 8000 }],
    });
    const imp = t.filter((x) => x.categoria === "Implantação / Venda");
    const men = t.filter((x) => x.categoria === "Mensalidade de contrato");
    expect(imp.map((x) => x.valor)).toEqual([8000]);
    expect(men).toHaveLength(12);
    expect(men[0]).toMatchObject({ vencimento: "2026-12-10", valor: 5000 });
  });
});
