import { describe, expect, it } from "vitest";
import { calcularPerformance, inicioSemana, novasRemarcacoes, type PlannerItem } from "./planner";

const base = (p: Partial<PlannerItem>): PlannerItem => ({
  id: Math.random().toString(), origem: "tarefa", titulo: "x", prioridade: "media", estimativaMin: null,
  planejada: "2026-10-20", entrega: null, status: "aberta", concluidoEm: null, remarcacoes: 0, ...p,
});

describe("planner", () => {
  it("aderência = concluídas / planejadas no período", () => {
    const p = calcularPerformance([base({ status: "concluida", concluidoEm: "2026-10-20T10:00:00Z" }), base({})], "2026-10-19", "2026-10-25");
    expect(p.aderencia).toBe(50);
  });
  it("pontualidade conta entregas até o prazo", () => {
    const p = calcularPerformance([
      base({ status: "concluida", entrega: "2026-10-20", concluidoEm: "2026-10-20T20:00:00Z" }),
      base({ status: "concluida", entrega: "2026-10-20", concluidoEm: "2026-10-22T09:00:00Z" }),
    ], "2026-10-19", "2026-10-25");
    expect(p.pontualidade).toBe(50);
  });
  it("tarefas recusadas ou aguardando aceite não entram na conta", () => {
    const p = calcularPerformance([base({ status: "recusada" }), base({ status: "aguardando" })], "2026-10-19", "2026-10-25");
    expect(p.planejadas).toBe(0);
  });
  it("score Excelente com tudo feito no prazo e sem remarcação", () => {
    const p = calcularPerformance([base({ status: "concluida", entrega: "2026-10-21", concluidoEm: "2026-10-20T10:00:00Z" })], "2026-10-19", "2026-10-25");
    expect(p.score).toBe(100);
    expect(p.classificacao).toBe("Excelente");
  });
  it("remarcação só conta quando já havia dia planejado", () => {
    expect(novasRemarcacoes(0, null, "2026-10-20")).toBe(0);
    expect(novasRemarcacoes(0, "2026-10-20", "2026-10-21")).toBe(1);
  });
  it("semana começa na segunda", () => {
    expect(inicioSemana("2026-10-21")).toBe("2026-10-19");
  });
});
