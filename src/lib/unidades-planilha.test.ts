import { describe, expect, it } from "vitest";
import { gerarCsv, inferirAndar, lerCsv, MODELO } from "./unidades-planilha";

describe("planilha de unidades", () => {
  it("modelo gerado é relido sem erros", () => {
    const r = lerCsv(gerarCsv(MODELO));
    expect(r.erros).toEqual([]);
    expect(r.linhas).toHaveLength(3);
    expect(r.linhas[0]!.fracao_ideal).toBe(0.0125);
  });
  it("infere andar pelo número", () => {
    expect(inferirAndar("1203")).toBe(12);
    expect(lerCsv("Bloco;Unidade\nA;302").linhas[0]!.andar).toBe(3);
  });
  it("exige Bloco e Unidade e aponta repetidas", () => {
    const r = lerCsv("Bloco;Unidade\nA;101\nA;101\n;102");
    expect(r.linhas).toHaveLength(1);
    expect(r.erros.map((e) => e.linha)).toEqual([3, 4]);
  });
  it("rejeita tipo inválido", () => {
    expect(lerCsv("Bloco;Unidade;Tipo\nA;1;castelo").erros).toHaveLength(1);
  });
});
