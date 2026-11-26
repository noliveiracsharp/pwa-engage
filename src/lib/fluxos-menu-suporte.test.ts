import { describe, it, expect } from "vitest";
import { executarFluxo, type NoFluxo } from "./fluxos-motor";

const nos: NoFluxo[] = [
  { id: "m", data: { tipo: "menu", lista_origem: "unidades", lista_rotulo: "{{nome}}", guardar_em: "unidade" } },
  { id: "f", data: { tipo: "mensagem", texto: "Unidade {{unidade.id}}" } },
];
const estado = { no_atual: "m", status: "aguardando" as const, variaveis: { unidades: JSON.stringify([{ id: "153", nome: "The Parker (Torre - Apto 153)" }]) } };
describe("seleção de unidade no suporte", () => {
  it.each(["selecionado", "op-0", "saida"])("continua após resposta 1 na saída %s", (sourceHandle) => {
    const r = executarFluxo({ nos, conexoes: [{ source: "m", target: "f", sourceHandle }], estado, texto: "1" });
    expect(r.acoes).toEqual([{ tipo: "mensagem", texto: "Unidade 153" }]);
    expect(r.estado.variaveis["unidade"]).toContain('"id":"153"');
  });
  it("encaminha para humano quando a escolha não tem continuação", () => {
    const r = executarFluxo({ nos, conexoes: [], estado, texto: "1" });
    expect(r.estado.status).toBe("transbordo");
    expect(r.acoes).toContainEqual({ tipo: "modo", modo: "Humano" });
  });
});