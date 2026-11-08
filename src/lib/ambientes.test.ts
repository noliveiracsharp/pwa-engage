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
