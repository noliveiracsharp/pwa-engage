import { describe, expect, it } from "vitest";
import { novoCustoCotacao, novoCustoMenor, ofertaAceitaNovoCusto, recalcLinhaCusto, vendaPreservandoMargem } from "./custo-cotacao";

describe("custo vindo da cotação", () => {
  it("só atualiza quando o cotado é menor", () => {
    expect(novoCustoMenor(100, 90)).toBe(90);
    expect(novoCustoMenor(100, 110)).toBeNull();
    expect(novoCustoMenor(100, 100)).toBeNull();
  });
  it("ofertas em ativação ou fechamento não mudam", () => {
    expect(ofertaAceitaNovoCusto("Ativação")).toBe(false);
    expect(ofertaAceitaNovoCusto("Fechamento")).toBe(false);
    expect(ofertaAceitaNovoCusto("Em andamento")).toBe(true);
  });
  it("mantém venda e recalcula lucro", () => {
    expect(recalcLinhaCusto({ quantidade: 2, total_linha: 300, imposto_valor: 0 }, 90)).toEqual({ preco_custo: 90, custo_total: 180, lucro: 120, margem_pct: 40 });
  });
  it("aumento de custo só com autorização", () => {
    expect(novoCustoCotacao(100, 120, false)).toBeNull();
    expect(novoCustoCotacao(100, 120, true)).toBe(120);
    expect(novoCustoCotacao(100, 80, false)).toBe(80);
  });
  it("venda preserva margem e imposto", () => {
    expect(vendaPreservandoMargem(60, 30, 10)).toBe(100);
    expect(vendaPreservandoMargem(60, 0, 10)).toBeNull();
  });
});
