import { describe, expect, it } from "vitest";
import { linhaOfertaDoItem, mensagemOfertaChat } from "./comercial-chat";

describe("comercial pelo chat", () => {
  it("taxa do laudo usa o preço de tabela do catálogo", () => {
    const l = linhaOfertaDoItem({ id: "x", descricao: "Taxa de vistoria", preco_venda: 250, preco_custo: 50 });
    expect(l.valor_unitario).toBe(250);
    expect(l.lucro).toBe(200);
  });
  it("mensagem leva o link de aprovação quando existe", () => {
    expect(mensagemOfertaChat({ nome: "Ana", numero: "#2026-0001", total: 250, link: "https://x/proposta/abc" })).toContain("https://x/proposta/abc");
  });
});
