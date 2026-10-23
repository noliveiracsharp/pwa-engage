import { describe, expect, it } from "vitest";
import { ehRespostaAutomatica, instanciaParaAvisos } from "./instancia-finalidade";

describe("instanciaParaAvisos", () => {
  it("prefere a instância de notificações", () => {
    const r = instanciaParaAvisos([{ id: 1, finalidade: "atendimento" }, { id: 2, finalidade: "notificacoes" }]);
    expect(r?.id).toBe(2);
  });
  it("usa a única instância quando não há de notificações", () => {
    expect(instanciaParaAvisos([{ id: 1, finalidade: "atendimento" }])?.id).toBe(1);
  });
  it("ignora inativas e chat", () => {
    expect(instanciaParaAvisos([{ id: 1, finalidade: "notificacoes", status: false }, { id: 3, tipo: "chat" }, { id: 2 }])?.id).toBe(2);
  });
});

describe("ehRespostaAutomatica", () => {
  it("detecta auto-resposta de fornecedor", () => {
    expect(ehRespostaAutomatica("Olá! Obrigado por entrar em contato. Em breve retornaremos.")).toBe(true);
  });
  it("não marca mensagem comum", () => {
    expect(ehRespostaAutomatica("Pode me mandar o preço?")).toBe(false);
  });
});
