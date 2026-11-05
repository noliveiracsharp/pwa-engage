import { describe, expect, it } from "vitest";
import { detectarNota, notaDaLinha } from "./csat";

describe("detectarNota", () => {
  it("número simples", () => expect(detectarNota("5")).toBe(5));
  it("nota com palavra", () => expect(detectarNota("Nota 4")).toBe(4));
  it("estrelas emoji", () => expect(detectarNota("⭐⭐⭐")).toBe(3));
  it("opção da lista", () => expect(detectarNota("2 ⭐⭐ Regular")).toBe(2));
  it("fora da escala", () => expect(detectarNota("7")).toBeNull());
  it("conversa normal não é nota", () => expect(detectarNota("Oi, preciso de ajuda")).toBeNull());
  it("frase com número não é nota", () => expect(detectarNota("tenho 3 dúvidas")).toBeNull());
});

describe("notaDaLinha", () => {
  it("primeira linha é nota 5", () => expect(notaDaLinha("1")).toBe(5));
  it("última linha é nota 1", () => expect(notaDaLinha("5")).toBe(1));
});
