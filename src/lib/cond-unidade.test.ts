import { describe, expect, it } from "vitest";
import { acaoLocacao, limiteVeiculosUnidade, nomeConfere, numerosEmConflito, podeAtivarVeiculo } from "./cond-unidade";

describe("veículos ativos", () => {
  it("bloqueia ao atingir o limite configurado", () => {
    expect(podeAtivarVeiculo(1, 1)).toBe(false);
    expect(podeAtivarVeiculo(0, 1)).toBe(true);
  });
  it("sem limite libera sempre", () => expect(podeAtivarVeiculo(10, null)).toBe(true));
  it("limite da unidade prevalece sobre o padrão", () => expect(limiteVeiculosUnidade(3, 1)).toBe(3));
  it("unidade com zero vagas vale zero", () => expect(limiteVeiculosUnidade(0, 2)).toBe(0));
  it("sem limite próprio herda o padrão", () => expect(limiteVeiculosUnidade(null, 2)).toBe(2));
});

describe("transferência de bloco", () => {
  it("aponta números repetidos no destino", () => expect(numerosEmConflito(["101", "102"], ["102 ", "201"])).toEqual(["102"]));
  it("exige o nome do bloco para apagar tudo", () => {
    expect(nomeConfere("torre a", "Torre A")).toBe(true);
    expect(nomeConfere("Torre", "Torre A")).toBe(false);
  });
});

describe("locação", () => {
  it("própria inicia, alugada encerra, vazia não tem ação", () => {
    expect(acaoLocacao("propria")).toBe("iniciar");
    expect(acaoLocacao("alugada")).toBe("encerrar");
    expect(acaoLocacao("vazia")).toBeNull();
  });
});
