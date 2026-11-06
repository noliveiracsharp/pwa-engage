import { describe, expect, it } from "vitest";
import { passaClassificacao, SEM_CLASSIFICACAO } from "./filtro-classificacao";

describe("passaClassificacao", () => {
  it("vazio mostra todos", () => expect(passaClassificacao([], null)).toBe(true));
  it("várias classificações", () => {
    expect(passaClassificacao(["a", "b"], "b")).toBe(true);
    expect(passaClassificacao(["a", "b"], "c")).toBe(false);
  });
  it("sem classificação", () => {
    expect(passaClassificacao([SEM_CLASSIFICACAO], null)).toBe(true);
    expect(passaClassificacao([SEM_CLASSIFICACAO], "a")).toBe(false);
    expect(passaClassificacao(["a"], "")).toBe(false);
  });
});
