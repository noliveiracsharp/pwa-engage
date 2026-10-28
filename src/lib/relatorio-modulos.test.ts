import { describe, expect, it } from "vitest";
import { tabelasDoModulo } from "./relatorio-modulos";
import { agregar, aplicarFiltrosRelacao } from "./relatorio-grafico";

describe("relatórios por módulo", () => {
  it("Projetos envia só tabelas de projetos e apoio, sem ofertas", () => {
    const t = tabelasDoModulo("projetos");
    expect(t).toContain("projetos");
    expect(t).toContain("projetos_status");
    expect(t).not.toContain("orcamentos");
  });
  it("filtra projetos pelo nome do status Erro (sem acento/maiúscula)", () => {
    const rows = [{ nome: "A", "projetos_status.descricao": "ERRO" }, { nome: "B", "projetos_status.descricao": "Concluído" }];
    expect(aplicarFiltrosRelacao(rows, [{ campo: "projetos_status.descricao", operador: "ilike", valor: "%erro%" }])).toHaveLength(1);
  });
  it("gráfico por mês fica em ordem cronológica", () => {
    const { dados } = agregar([{ d: "2026-03-05" }, { d: "2026-01-10" }, { d: "2026-01-20" }], { tipo: "linha", agrupar: "d", medida: "contagem", periodo: "mes" });
    expect(dados.map((x) => [x.nome, x._total])).toEqual([["2026-01", 2], ["2026-03", 1]]);
  });
});
