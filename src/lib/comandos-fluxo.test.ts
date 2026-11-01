import { describe, expect, it } from "vitest";
import { detectarComando, mensagemComando } from "./comandos-fluxo";

describe("comandos globais do fluxo", () => {
  it("#inicio volta ao começo", () => expect(detectarComando("#inicio")).toBe("inicio"));
  it("#atendente vai para humano, mesmo no meio do texto", () => expect(detectarComando("quero #Atendente agora")).toBe("atendente"));
  it("palavra sozinha sem # também vale", () => expect(detectarComando("Menu")).toBe("inicio"));
  it("palavra dentro de frase sem # não dispara", () => expect(detectarComando("qual o menu de hoje")).toBeNull());
  it("#sair encerra", () => expect(detectarComando("#cancelar")).toBe("sair"));
  it("palavras extras da empresa", () => expect(detectarComando("9", { cmd_atendente: "9, urgente" })).toBe("atendente"));
  it("texto comum segue o fluxo", () => expect(detectarComando("2")).toBeNull());
  it("mensagem personalizada substitui a padrão", () => expect(mensagemComando("atendente", { msg_atendente: "Já te chamo!" })).toBe("Já te chamo!"));
});
