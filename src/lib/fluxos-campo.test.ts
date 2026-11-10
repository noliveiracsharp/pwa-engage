import { describe, it, expect } from "vitest";
import { acoesCampo } from "./fluxos-motor";

const vars = { item_escolhido: JSON.stringify({ unidade: "42", predio_ds: "Torre A", apto_id: 53644, extra: "x" }) };

describe("Preencher campo", () => {
  it("modo JSON grava só os campos marcados", () => {
    const r = acoesCampo({ modo: "json", origem: "{{item_escolhido}}", chaves: ["unidade", "apto_id"] }, vars);
    expect(r).toEqual([{ tipo: "campo", chave: "unidade", valor: "42" }, { tipo: "campo", chave: "apto_id", valor: "53644" }]);
  });
  it("várias linhas com caminho", () => {
    const r = acoesCampo({ linhas: [{ chave: "torre", valor: "{{item_escolhido.predio_ds}}" }] }, vars);
    expect(r).toEqual([{ tipo: "campo", chave: "torre", valor: "Torre A" }]);
  });
  it("blocos antigos de campo único continuam", () => {
    expect(acoesCampo({ chave: "a", valor: "b" }, vars)).toEqual([{ tipo: "campo", chave: "a", valor: "b" }]);
  });
});
