import { describe, it, expect } from "vitest";
import { isEncerrado } from "./atendimentos";

const etapas = [
  { id: "e1", descricao: "Encerramento", is_default_encerrado: false },
  { id: "e2", descricao: "Atendente", is_default_encerrado: false },
  { id: "e3", descricao: "Encerradas", is_default_encerrado: true },
];
describe("isEncerrado", () => {
  it("etapa chamada Encerramento conta como encerrada mesmo sem marcação", () => {
    expect(isEncerrado({ kanban_etapa_id: "e1" }, etapas)).toBe(true);
  });
  it("etapa marcada como encerramento", () => {
    expect(isEncerrado({ kanban_etapa_id: "e3" }, etapas)).toBe(true);
  });
  it("etapa de trabalho continua ativa", () => {
    expect(isEncerrado({ kanban_etapa_id: "e2", status: "Atendente" }, etapas)).toBe(false);
  });
  it("status Encerrado conta como encerrado", () => {
    expect(isEncerrado({ kanban_etapa_id: "e2", status: "Encerrado" }, etapas)).toBe(true);
  });
});
