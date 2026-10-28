import { describe, expect, it } from "vitest";
import { agregar, extrairGrafico, filtroGrafico } from "./relatorio-grafico";

describe("relatorio-grafico", () => {
  it("soma quantidade por item separando produto e serviço, ordenado pelo total", () => {
    const rows = [
      { nome: "Câmera", natureza: "produto", quantidade: 4 },
      { nome: "Câmera", natureza: "produto", quantidade: 2 },
      { nome: "Instalação", natureza: "servico", quantidade: 10 },
    ];
    const r = agregar(rows, { tipo: "barras", agrupar: "nome", separar: "natureza", medida: "quantidade" });
    expect(r.series).toEqual(["produto", "servico"]);
    expect(r.dados[0]).toMatchObject({ nome: "Instalação", servico: 10 });
    expect(r.dados[1]).toMatchObject({ nome: "Câmera", produto: 6 });
  });

  it("guarda e recupera o gráfico dentro dos filtros", () => {
    const g = { tipo: "pizza" as const, agrupar: "natureza", medida: "contagem" };
    const { grafico, filtros } = extrairGrafico([{ campo: "status", operador: "eq", valor: "x" }, filtroGrafico(g)]);
    expect(grafico).toEqual(g);
    expect(filtros).toHaveLength(1);
  });
});
