import { describe, expect, it } from "vitest";
import { destinoDoAmbiente, montarAmbientes, precisaEscolher, type VinculoAcesso } from "./ambientes";

const v = (o: Partial<VinculoAcesso>): VinculoAcesso => ({
  vinculo_id: "v", unidade_id: "u1", condominio_id: "c", condominio_nome: "Vila das Flores", bloco: "Bloco B", numero: "42", papel: "proprietario", ...o,
});

describe("ambientes de acesso", () => {
  it("admin que também é proprietário precisa escolher", () => {
    const a = montarAmbientes({ nome: "ConectCon", perfil: "Administrador" }, [v({})]);
    expect(a.map((x) => x.tipo)).toEqual(["empresa", "unidade"]);
    expect(precisaEscolher(a)).toBe(true);
    expect(a[1]!.subtitulo).toBe("Proprietário · Bloco B · Unidade 42");
  });
  it("só morador entra direto na unidade", () => {
    const a = montarAmbientes(null, [v({})]);
    expect(precisaEscolher(a)).toBe(false);
    expect(destinoDoAmbiente(a[0]!)).toBe("/minha-unidade");
  });
  it("só empresa entra direto no painel", () => {
    const a = montarAmbientes({ nome: "ConectCon", perfil: "" }, []);
    expect(precisaEscolher(a)).toBe(false);
    expect(destinoDoAmbiente(a[0]!)).toBe("/dashboard");
  });
  it("mesma unidade com dois vínculos aparece uma vez", () => {
    expect(montarAmbientes(null, [v({ vinculo_id: "a" }), v({ vinculo_id: "b" })])).toHaveLength(1);
  });
});

import { emModoUnidade, filtrarAmbientes } from "./ambientes";
describe("modo unidade e filtro", () => {
  it("só unidade oculta o menu da empresa", () => {
    expect(emModoUnidade("empresa")).toBe(false);
    expect(emModoUnidade(null)).toBe(false);
    expect(emModoUnidade("v1")).toBe(true);
  });
  it("filtra por torre sem acento", () => {
    const l = [
      { tipo: "empresa", id: "empresa", titulo: "ConectCon", subtitulo: "Gestão da empresa" },
      { tipo: "unidade", id: "v1", titulo: "Conectcon", subtitulo: "Proprietário · Torre 1 · Unidade 101", vinculo: {} },
    ] as never;
    expect(filtrarAmbientes(l, "torre 1").map((a) => a.id)).toEqual(["v1"]);
    expect(filtrarAmbientes(l, "gestao").map((a) => a.id)).toEqual(["empresa"]);
  });
});

import { rotuloCargo } from "./ambientes";
describe("rotuloCargo", () => {
  it("síndico proprietário aparece como Síndico (Proprietário)", () => {
    expect(rotuloCargo({ papel: "proprietario", funcao: "sindico" })).toBe("Síndico (Proprietário)");
  });
  it("condômino comum mostra só o papel", () => {
    expect(rotuloCargo({ papel: "proprietario", funcao: "condomino" })).toBe("Proprietário");
  });
});
