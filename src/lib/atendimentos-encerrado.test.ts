import { describe, it, expect } from "vitest";
import { isEncerrado, etapaHumano, transferenciaPayload } from "./atendimentos";

const etapas = [
  { id: "e1", descricao: "Encerramento", is_default_encerrado: false },
  { id: "e2", descricao: "Atendente", is_default_encerrado: false },
  { id: "e3", descricao: "Encerradas", is_default_encerrado: true },
];
describe("isEncerrado", () => {
  it("encerramento sem etapa retira o atendimento dos ativos", () => {
    expect(isEncerrado({ encerrado_em: "2026-11-26T01:48:00Z" }, [])).toBe(true);
    expect(isEncerrado({ encerrado_em: null }, [])).toBe(false);
  });
  it("transferência para Nível 1 fica humana e sem responsável", () => {
    const lista = [{ id: "bot", kanban_nome_id: "suporte", descricao: "Robô", ordem: 0 },
      { id: "n1", kanban_nome_id: "suporte", descricao: "Nível 1 Atendentes", ordem: 1 }];
    expect(etapaHumano(lista, "suporte")?.["id"]).toBe("n1");
    expect(transferenciaPayload("suporte", "n1", lista)).toMatchObject({ kanban_nome_id: "suporte", kanban_etapa_id: "n1", modo_atendimento: "Humano", usuario_responsavel_id: null, encerrado_em: null });
  });
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
