import { describe, expect, it } from "vitest";
import { CATEGORIAS_DOC, categoriasEfetivas, codigoCategoria } from "./cond-documentos";

describe("categorias de documentos por condomínio", () => {
  it("sem categorias próprias usa a lista padrão", () => {
    expect(categoriasEfetivas([])).toHaveLength(CATEGORIAS_DOC.length);
  });
  it("com categorias próprias usa só as do condomínio, Outros no fim", () => {
    const r = categoriasEfetivas([
      { id: "1", codigo: "outros", descricao: "Outros" },
      { id: "2", codigo: "obras", descricao: "Obras", controla_vencimento: true },
    ]);
    expect(r.map((c) => c.value)).toEqual(["obras", "outros"]);
    expect(r[0].vence).toBe(true);
  });
  it("gera código único sem acentos", () => {
    expect(codigoCategoria("Segurança Patrimonial", [])).toBe("seguranca_patrimonial");
    expect(codigoCategoria("Atas", ["atas"])).toBe("atas_2");
  });
});
