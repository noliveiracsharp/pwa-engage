import { describe, expect, it } from "vitest";
import { limiteDisponivelCartao, limiteUsadoCartao, melhorDiaCompra, parcelasItensCartao } from "./financeiro";

describe("cartão de crédito", () => {
  it("usado soma só parcelas em aberto do cartão", () => {
    const t = [
      { cartao_id: "c1", status: "aberto", valor: 100 },
      { cartao_id: "c1", status: "pago", valor: 50 },
      { cartao_id: "c1", status: "cancelado", valor: 30 },
      { cartao_id: "c2", status: "aberto", valor: 70 },
    ];
    expect(limiteUsadoCartao(t, "c1")).toBe(100);
  });
  it("disponível é limite menos usado, mínimo zero", () => {
    expect(limiteDisponivelCartao(5000, 1200)).toBe(3800);
    expect(limiteDisponivelCartao(1000, 1500)).toBe(0);
  });
  it("melhor dia de compra é o dia após o fechamento", () => {
    expect(melhorDiaCompra(25)).toBe(26);
    expect(melhorDiaCompra(31)).toBe(1);
  });
  it("item a item: cada item gera suas parcelas e o total bate", () => {
    const p = parcelasItensCartao([
      { descricao: "Monitor", categoria: "TI", valor: 1000, parcelas: 10 },
      { descricao: "Café", categoria: "Copa", valor: 50, parcelas: 1 },
    ], { dataCompra: "2026-10-10", diaFechamento: 25, diaVencimento: 5 });
    expect(p.length).toBe(11);
    expect(p.reduce((s, x) => s + x.valor, 0)).toBeCloseTo(1050, 2);
  });
});
