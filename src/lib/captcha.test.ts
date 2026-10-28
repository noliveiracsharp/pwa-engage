import { describe, expect, it } from "vitest";
import { gerarDesafio, respostaCorreta } from "./captcha";

describe("captcha do login", () => {
  it("aceita somente a soma correta", () => {
    expect(respostaCorreta({ a: 3, b: 4 }, "7")).toBe(true);
    expect(respostaCorreta({ a: 3, b: 4 }, "8")).toBe(false);
    expect(respostaCorreta({ a: 3, b: 4 }, "")).toBe(false);
  });
  it("gera números de 1 a 9", () => {
    expect(gerarDesafio(() => 0)).toEqual({ a: 1, b: 1 });
    expect(gerarDesafio(() => 0.999)).toEqual({ a: 9, b: 9 });
  });
});
