import { describe, expect, it } from "vitest";
import { valoresFiscaisDoTitulo, type FonteRateio } from "./rateio";

const f = (peso: number, produto: boolean, id: string): FonteRateio => ({ item_id: id, descricao: id, quantidade: 1, peso, centro_custo_id: null, plano_contas_id: null, produto, origem_tipo: "oferta_item", origem_id: id });

describe("valores fiscais do título da Oferta", () => {
  it("separa produtos (NF-e) e serviços (NFS-e)", () => {
    const t = { tipo: "receber", descricao: "x", categoria: "Implantação / Venda", vencimento: "2026-09-22", valor: 12225.72, parceiro_id: "c", origem_tipo: "oferta", origem_id: "o" } as never;
    expect(valoresFiscaisDoTitulo(t, [f(10625.72, true, "p"), f(1600, false, "s")], "c")).toEqual({ nfe_valor: 10625.72, nfse_valor: 1600 });
  });
});
