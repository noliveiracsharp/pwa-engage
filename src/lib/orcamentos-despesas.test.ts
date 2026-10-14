import { describe, expect, it } from "vitest";
import { despesasFromValue, despesasToValue, totalDespesas } from "./orcamentos";

describe("despesas operacionais", () => {
  it("soma alimentação e transporte", () => {
    expect(totalDespesas([{ valor: "150,50" }, { valor: "300" }])).toBe(450.5);
  });
  it("ignora valores negativos ou vazios", () => {
    expect(totalDespesas([{ valor: "-20" }, { valor: "" }, { valor: "10" }])).toBe(10);
  });
  it("grava só linhas com valor e relê a categoria", () => {
    const gravado = despesasToValue([
      { key: "a", categoria: "alimentacao", descricao: " Almoço ", valor: "80" },
      { key: "b", categoria: "transporte", descricao: "", valor: "" },
    ]);
    expect(gravado).toEqual([{ categoria: "alimentacao", descricao: "Almoço", valor: 80 }]);
    expect(despesasFromValue(gravado)[0]?.categoria).toBe("alimentacao");
  });
});
