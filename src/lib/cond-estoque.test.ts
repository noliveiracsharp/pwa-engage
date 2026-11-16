import { describe, expect, it } from "vitest";
import { custoMateriais, saldoItem, situacaoEstoque, validarMovimento } from "./cond-estoque";

describe("estoque do condomínio", () => {
  it("classifica a situação pelo mínimo", () => {
    expect(situacaoEstoque(0, 5)).toBe("zerado");
    expect(situacaoEstoque(4, 5)).toBe("abaixo");
    expect(situacaoEstoque(6, 5)).toBe("atencao");
    expect(situacaoEstoque(7, 5)).toBe("normal");
  });
  it("calcula saldo por local considerando transferências", () => {
    const m = [
      { item_id: "a", local_destino_id: "L1", quantidade: 10 },
      { item_id: "a", local_origem_id: "L1", local_destino_id: "L2", quantidade: 3 },
      { item_id: "a", local_origem_id: "L2", quantidade: 1 },
    ];
    expect(saldoItem(m, "a", "L1")).toBe(7);
    expect(saldoItem(m, "a", "L2")).toBe(2);
    expect(saldoItem(m, "a")).toBe(9);
  });
  it("bloqueia saída maior que o saldo", () => {
    expect(validarMovimento({ tipo: "saida_os", quantidade: 5, origem: "L1", saldoOrigem: 4 })).toMatch(/Saldo insuficiente/);
    expect(validarMovimento({ tipo: "saida_os", quantidade: 4, origem: "L1", saldoOrigem: 4 })).toBeNull();
  });
  it("custo de materiais soma saídas e abate devoluções", () => {
    expect(custoMateriais([
      { tipo: "saida_os", quantidade: 4, custo_unitario: 12.5 },
      { tipo: "devolucao", quantidade: 1, custo_unitario: 12.5 },
      { tipo: "transferencia", quantidade: 9, custo_unitario: 1 },
    ])).toBe(37.5);
  });
});
