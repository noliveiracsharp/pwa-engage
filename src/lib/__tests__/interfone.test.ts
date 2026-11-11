import { describe, expect, it } from "vitest";
import { CENTRAL, etapaAtual, lerDiscagem, montarEtapas, tocandoPara } from "../interfone";

const P = [
  { usuarioId: "tit", papel: "proprietario", idade: 45, interfone: null },
  { usuarioId: "filho", papel: "familiar", idade: 12, interfone: null },
  { usuarioId: "esposa", papel: "familiar", idade: 40, interfone: null },
  { usuarioId: "diarista", papel: "prestador", idade: 30, interfone: true },
  { usuarioId: "pedreiro", papel: "prestador", idade: 30, interfone: null },
];
const cfg = { toqueSeg: 20, menoresRecebem: false, centralAtiva: true };

describe("interfone", () => {
  it("ordena titular, demais moradores maiores, prestadores liberados e central", () => {
    expect(montarEtapas(P, cfg)).toEqual([["tit"], ["esposa"], ["diarista"], [CENTRAL]]);
  });
  it("menores recebem quando o parâmetro permite", () => {
    expect(montarEtapas(P, { ...cfg, menoresRecebem: true })[1]).toEqual(["filho", "esposa"]);
  });
  it("prestador só entra quando marcado para receber", () => {
    expect(montarEtapas(P, cfg).flat()).not.toContain("pedreiro");
  });
  it("pula etapas vazias e não usa central desligada", () => {
    expect(montarEtapas([P[0]!], { ...cfg, centralAtiva: false })).toEqual([["tit"]]);
  });
  it("transborda a cada 20 segundos e encerra no fim", () => {
    expect(etapaAtual(19, 20, 4)).toBe(0);
    expect(etapaAtual(20, 20, 4)).toBe(1);
    expect(etapaAtual(80, 20, 4)).toBe(-1);
  });
  it("o toque é cumulativo", () => {
    expect(tocandoPara([["a"], ["b"], ["c"]], 1)).toEqual(["a", "b"]);
  });
  it("lê a discagem", () => {
    expect(lerDiscagem("b-102")).toEqual({ bloco: "B", numero: "102" });
    expect(lerDiscagem("102")).toEqual({ bloco: "", numero: "102" });
    expect(lerDiscagem("abc")).toBeNull();
  });
});
