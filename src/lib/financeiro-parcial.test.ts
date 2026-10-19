import { describe, expect, it } from "vitest";
import { distribuirPagamento, saldoTitulo, situacaoTitulo } from "@/lib/financeiro";

describe("pagamento parcial", () => {
  it("título aberto com parte paga fica como parcial", () => {
    expect(situacaoTitulo({ status: "aberto", valor: 1000, valor_pago: 300, vencimento: "2099-01-01" })).toBe("parcial");
  });
  it("saldo = valor − já pago", () => {
    expect(saldoTitulo({ status: "aberto", valor: 1000, valor_pago: 300 })).toBe(700);
    expect(saldoTitulo({ status: "pago", valor: 1000, valor_pago: 1000 })).toBe(0);
  });
  it("pagamento mínimo da fatura abate itens na ordem e deixa o resto parcial", () => {
    const itens = [{ id: "a", status: "aberto", valor: 25.29 }, { id: "b", status: "aberto", valor: 209 }, { id: "c", status: "aberto", valor: 1.16 }];
    expect(distribuirPagamento(itens, 100)).toEqual([
      { id: "a", valor_pago: 25.29, quitado: true },
      { id: "b", valor_pago: 74.71, quitado: false },
    ]);
  });
});
