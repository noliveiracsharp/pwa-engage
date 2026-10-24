import { describe, expect, it } from "vitest";
import { bloqueioMovimento, statusPelaAlcada } from "./cotacao-fluxo";

describe("statusPelaAlcada", () => {
  it("abaixo do valor mínimo passa direto para Aprovado", () => {
    expect(statusPelaAlcada("em_cotacao", { temPreco: true, situacao: "dispensada", temPedido: false })).toBe("aprovado");
  });
  it("acima do valor mínimo vai para Aguardando aprovação", () => {
    expect(statusPelaAlcada("cotado", { temPreco: true, situacao: "pendente", temPedido: false })).toBe("aguardando_aprovacao");
  });
  it("sem preço mantém o status (laudo gera Pendente)", () => {
    expect(statusPelaAlcada("pendente", { temPreco: false, situacao: "dispensada", temPedido: false })).toBe("pendente");
  });
  it("rejeição vira Reprovado e pedido vira Pedido gerado", () => {
    expect(statusPelaAlcada("aguardando_aprovacao", { temPreco: true, situacao: "rejeitada", temPedido: false })).toBe("reprovado");
    expect(statusPelaAlcada("aprovado", { temPreco: true, situacao: "aprovada", temPedido: true })).toBe("pedido_gerado");
  });
});

describe("bloqueioMovimento", () => {
  it("não permite arrastar para Aprovado", () => {
    expect(bloqueioMovimento("cotado", "aprovado")).not.toBeNull();
  });
  it("permite mover entre etapas manuais", () => {
    expect(bloqueioMovimento("pendente", "em_cotacao")).toBeNull();
    expect(bloqueioMovimento("cotado", "cancelado")).toBeNull();
  });
});

import { fornecedorRespondeu } from "./cotacao-fluxo";
describe("fornecedorRespondeu", () => {
  const f = { cotacao_id: "c1", fornecedor_id: "f1", respondido: false };
  it("considera preço manual lançado como resposta", () => {
    expect(fornecedorRespondeu(f, [{ cotacao_id: "c1", fornecedor_id: "f1", preco_unitario: 53.46 }])).toBe(true);
  });
  it("sem preço e sem flag continua aguardando", () => {
    expect(fornecedorRespondeu(f, [{ cotacao_id: "c1", fornecedor_id: "f1", preco_unitario: 0 }])).toBe(false);
  });
});
