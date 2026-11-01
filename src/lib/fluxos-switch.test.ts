import { describe, it, expect } from "vitest";
import { comparar, executarFluxo } from "@/lib/fluxos-motor";

describe("operadores numéricos", () => {
  it("maior/menor com vírgula", () => {
    expect(comparar("10,5", "maior", "10")).toBe(true);
    expect(comparar("0", "maior", "0")).toBe(false);
    expect(comparar("0", "maior_igual", "0")).toBe(true);
    expect(comparar("3", "menor", "5")).toBe(true);
    expect(comparar("5", "menor_igual", "4")).toBe(false);
    expect(comparar("", "menor", "5")).toBe(false);
  });
});

describe("switch", () => {
  const nos = [
    { id: "g", data: { tipo: "gatilho" as const } },
    { id: "s", data: { tipo: "switch" as const, variavel: "ultima_mensagem", operador: "igual", casos: "Comercial\nSuporte" } },
    { id: "a", data: { tipo: "mensagem" as const, texto: "A" } },
    { id: "b", data: { tipo: "mensagem" as const, texto: "B" } },
    { id: "p", data: { tipo: "mensagem" as const, texto: "P" } },
  ];
  const conexoes = [
    { source: "g", target: "s" }, { source: "s", target: "a", sourceHandle: "caso-0" },
    { source: "s", target: "b", sourceHandle: "caso-1" }, { source: "s", target: "p", sourceHandle: "padrao" },
  ];
  const run = (t: string) => executarFluxo({ nos, conexoes, estado: null, texto: t }).acoes.map((a) => ("texto" in a ? a.texto : ""));
  it("escolhe o caso", () => expect(run("suporte")).toEqual(["B"]));
  it("cai no padrão", () => expect(run("outro")).toEqual(["P"]));
});
