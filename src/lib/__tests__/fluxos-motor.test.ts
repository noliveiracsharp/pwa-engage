import { describe, expect, it } from "vitest";
import { executarFluxo, type NoFluxo, type ConexaoFluxo } from "../fluxos-motor";

const nos: NoFluxo[] = [
  { id: "g", data: { tipo: "gatilho" } },
  { id: "k", data: { tipo: "kanban", etapa_id: "e1", prioridade: "alta" } },
  { id: "m", data: { tipo: "menu", texto: "Como podemos ajudar?", opcoes: "Comercial\nSuporte" } },
  { id: "t", data: { tipo: "transbordo", texto: "Transferindo" } },
];
const conexoes: ConexaoFluxo[] = [
  { source: "g", target: "k", sourceHandle: "saida" },
  { source: "k", target: "m", sourceHandle: "saida" },
  { source: "m", target: "t", sourceHandle: "op-1" },
];

describe("motor de fluxos", () => {
  it("primeira mensagem move no Kanban e envia o menu aguardando resposta", () => {
    const r = executarFluxo({ nos, conexoes, estado: null, texto: "oi" });
    expect(r.acoes[0]).toEqual({ tipo: "etapa", etapa_id: "e1", prioridade: "alta" });
    expect(r.acoes[1]).toEqual({ tipo: "mensagem", texto: "Como podemos ajudar?\n1. Comercial\n2. Suporte" });
    expect(r.estado).toMatchObject({ status: "aguardando", no_atual: "m" });
  });
  it("resposta 2 segue a opção Suporte até o transbordo", () => {
    const r = executarFluxo({ nos, conexoes, estado: { no_atual: "m", status: "aguardando", variaveis: {} }, texto: "2" });
    expect(r.acoes).toContainEqual({ tipo: "modo", modo: "Humano" });
    expect(r.estado.status).toBe("transbordo");
  });
  it("opção inválida sem ligação repete o menu", () => {
    const r = executarFluxo({ nos, conexoes, estado: { no_atual: "m", status: "aguardando", variaveis: {} }, texto: "9" });
    expect(r.estado).toMatchObject({ status: "aguardando", no_atual: "m" });
  });
});
