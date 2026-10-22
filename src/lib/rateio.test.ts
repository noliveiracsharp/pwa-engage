import { describe, expect, it } from "vitest";
import { diferencaRateio, linhasDoTitulo, ratearValor, type FonteRateio } from "./rateio";
import type { NovoTitulo } from "./financeiro";

const f = (o: Partial<FonteRateio>): FonteRateio => ({ item_id: null, descricao: "x", quantidade: 1, peso: 0, centro_custo_id: null,
  plano_contas_id: null, origem_tipo: "oferta_item", origem_id: null, ...o });
const titulo = (o: Partial<NovoTitulo>): NovoTitulo => ({ tipo: "receber", descricao: "", categoria: "Implantação / Venda", vencimento: "2026-10-10",
  valor: 0, parceiro_id: "cli", origem_tipo: "oferta", origem_id: "o", parcela_n: 1, ...o });

describe("rateio por centro de custo", () => {
  it("parcela de R$ 2.500 da Oferta vira R$ 2.000 CFTV e R$ 500 Instalações", () => {
    const l = linhasDoTitulo(titulo({ valor: 2500 }), [
      f({ peso: 8000, centro_custo_id: "cftv" }), f({ peso: 2000, centro_custo_id: "inst" }),
    ], "cli");
    expect(l.map((x) => [x.centro_custo_id, x.valor])).toEqual([["cftv", 2000], ["inst", 500]]);
  });

  it("a soma das linhas fecha centavo por centavo com o título", () => {
    const l = ratearValor(100, [f({ peso: 1 }), f({ peso: 1 }), f({ peso: 1 })]);
    expect(l.map((x) => x.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(diferencaRateio(100, l)).toBe(0);
  });

  it("mensalidade usa só itens recorrentes; implantação só os demais", () => {
    const fontes = [f({ peso: 300, recorrente: true, centro_custo_id: "saas" }), f({ peso: 700, centro_custo_id: "cftv" })];
    expect(linhasDoTitulo(titulo({ valor: 300, categoria: "Mensalidade de contrato" }), fontes, "cli").map((x) => x.centro_custo_id)).toEqual(["saas"]);
    expect(linhasDoTitulo(titulo({ valor: 700 }), fontes, "cli").map((x) => x.centro_custo_id)).toEqual(["cftv"]);
  });

  it("título de outro pagador só leva os itens faturados para ele", () => {
    const fontes = [f({ peso: 100, pagador: "adm", centro_custo_id: "a" }), f({ peso: 100, centro_custo_id: "b" })];
    expect(linhasDoTitulo(titulo({ valor: 50, parceiro_id: "adm" }), fontes, "cli").map((x) => x.centro_custo_id)).toEqual(["a"]);
  });

  it("pedido de compra a pagar rateia todos os itens do pedido", () => {
    const l = linhasDoTitulo(titulo({ tipo: "pagar", origem_tipo: "pedido", valor: 3000, parceiro_id: "forn" }), [
      f({ origem_tipo: "pedido_item", peso: 2500, centro_custo_id: "cftv" }), f({ origem_tipo: "pedido_item", peso: 500, centro_custo_id: "infra" }),
    ]);
    expect(l.map((x) => x.valor)).toEqual([2500, 500]);
  });
});
