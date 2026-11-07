import { describe, expect, it } from "vitest";
import { comissoesDaOferta, farolMargem, linhaDre, somarDre, trimestreDe } from "./dre-ofertas";

const orc = {
  id: "o1",
  total_itens: 10000,
  frete: 200,
  valores_adicionais: 0,
  desconto_valor: 200,
  total_custo: 5000,
  total_imposto: 1000,
  despesas_operacionais: [
    { key: "a", categoria: "alimentacao", descricao: "", valor: "300" },
    { key: "b", categoria: "transporte", descricao: "", valor: "200" },
  ],
};

describe("DRE de Ofertas", () => {
  it("resultado = líquido − custo − imposto − despesas − comissões", () => {
    const l = linhaDre(orc, 1500);
    expect(l.liquido).toBe(10000);
    expect(l.despesas).toBe(500);
    expect(l.resultado).toBe(2000);
    expect(l.margem).toBe(20);
  });

  it("fundos/reservas (Marketing, Inovação…) entram como custo na DRE", () => {
    const c = [
      { orcamento_id: "o1", beneficiario_id: "u1", papel_id: "com", valor: 300 },
      { orcamento_id: "o1", beneficiario_id: null, papel_id: "mkt", valor: 900 },
    ];
    expect(comissoesDaOferta(c, "o1")).toBe(1200);
  });

  it("soma despesas por categoria entre ofertas", () => {
    const t = somarDre([linhaDre(orc, 0), linhaDre(orc, 0)]);
    expect(t.despesasPorCategoria["alimentacao"]).toBe(600);
    expect(t.quantidade).toBe(2);
  });

  it("farol: 30% verde, 15% amarelo, 14,99% vermelho", () => {
    expect(farolMargem(30)).toBe("verde");
    expect(farolMargem(15)).toBe("amarelo");
    expect(farolMargem(14.99)).toBe("vermelho");
  });

  it("trimestre da data", () => {
    expect(trimestreDe("2026-04-01")).toBe(2);
    expect(trimestreDe("2026-12-31")).toBe(4);
  });
});
