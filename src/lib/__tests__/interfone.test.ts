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

import { mensagemInterfoneWhats } from "../interfone";
describe("aviso do interfone por WhatsApp", () => {
  it("leva unidade, visitante, motivo e link", () => {
    const t = mensagemInterfoneWhats({ nome: "Ana", condominio: "Res. Flores", unidade: "Torre A · Unidade 302", visitante: "Carlos", motivo: "Entrega", link: "https://x.co" });
    expect(t).toContain("Res. Flores");
    expect(t).toContain("Torre A · Unidade 302");
    expect(t).toContain("Visitante: Carlos");
    expect(t).toContain("Motivo: Entrega");
    expect(t).toContain("https://x.co");
  });
});

import { normalizarRamal, ramalDiscado, ramaisDuplicados } from "../interfone";
describe("ramais do interfone", () => {
  const ramais = [{ id: "a", nome: "Portaria", ramal: "15", categoria: "portaria" }, { id: "b", nome: "Churrasqueira", ramal: "*106", categoria: "lazer" }];
  it("normaliza o asterisco", () => expect(normalizarRamal(" *10-6 ")).toBe("*106"));
  it("acha ramal com asterisco", () => expect(ramalDiscado("*106", ramais)?.id).toBe("b"));
  it("não confunde 106 com *106", () => expect(ramalDiscado("106", ramais)).toBeNull());
  it("acha ramal simples", () => expect(ramalDiscado("15", ramais)?.nome).toBe("Portaria"));
  it("aponta duplicados", () => expect(ramaisDuplicados([{ ramal: "52" }, { ramal: "52" }, { ramal: "15" }])).toEqual(["52"]));
});
