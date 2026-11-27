import { describe, it, expect } from "vitest";
import { executarFluxo, valorVar, lerCaminho, agruparCampos, type Acao, type NoFluxo } from "./fluxos-motor";

const nos: NoFluxo[] = [
  { id: "m", data: { tipo: "menu", lista_origem: "unidades", lista_rotulo: "{{nome}}", guardar_em: "unidade" } },
  { id: "f", data: { tipo: "mensagem", texto: "Unidade {{unidade.id}}" } },
];
const estado = { no_atual: "m", status: "aguardando" as const, variaveis: { unidades: JSON.stringify([{ id: "153", nome: "The Parker (Torre - Apto 153)" }]) } };
describe("seleção de unidade no suporte", () => {
  it("aceita objetos e listas JSONB nativos sem trim", () => {
    const unidades = [{ id: "153", nome: "The Parker" }];
    expect(valorVar(unidades)).toEqual(unidades);
    expect(lerCaminho({ unidades }, "unidades.0.id")).toBe("153");
    expect(valorVar(34)).toBe(34);
  });
  it("resposta 1 percorre campos, espera e fila do Suporte sem etapa explícita", () => {
    const campos = Object.fromEntries(Array.from({ length: 34 }, (_, i) => [`campo_${i}`, `valor_${i}`]));
    const grafo: NoFluxo[] = [
      { id: "m", data: { tipo: "menu", lista_origem: "unidades", lista_rotulo: "{{nome}}" } },
      { id: "c", data: { tipo: "campo", modo: "json", origem: "item_escolhido", chaves: Object.keys(campos) } },
      { id: "e", data: { tipo: "mensagem", texto: "Aguarde" } },
      { id: "a", data: { tipo: "atribuir", quadro_id: "suporte", modo: "fila" } },
    ];
    const r = executarFluxo({ nos: grafo, texto: "1", estado: { no_atual: "m", status: "aguardando", variaveis: { unidades: [{ nome: "Condomínio Vn Ueno", ...campos }] } }, conexoes: [
      { source: "m", target: "c", sourceHandle: "selecionado" }, { source: "c", target: "e" }, { source: "e", target: "a" },
    ] });
    expect(r.acoes.filter((a) => a.tipo === "campo")).toHaveLength(34);
    expect(agruparCampos(r.acoes)).toEqual([
      { tipo: "campos", campos }, { tipo: "mensagem", texto: "Aguarde" },
      { tipo: "fila", quadro_id: "suporte", etapa_id: "", prioridade: "" },
    ]);
    expect(r.estado.status).toBe("finalizado");
  });
  it("preserva a etapa configurada no encaminhamento", () => {
    const r = executarFluxo({ nos: [{ id: "g", data: { tipo: "gatilho" } }, { id: "a", data: { tipo: "atribuir", quadro_id: "suporte", etapa_id: "nivel-2" } }], conexoes: [{ source: "g", target: "a" }], estado: null, texto: "Oi" });
    expect(r.acoes).toEqual([{ tipo: "fila", quadro_id: "suporte", etapa_id: "nivel-2", prioridade: "" }]);
  });
  it("não agrupa campos através de mensagens", () => {
    const acoes: Acao[] = [{ tipo: "campo", chave: "a", valor: "1" }, { tipo: "mensagem", texto: "Oi" }, { tipo: "campo", chave: "a", valor: "2" }];
    expect(agruparCampos(acoes)).toEqual([{ tipo: "campos", campos: { a: "1" } }, { tipo: "mensagem", texto: "Oi" }, { tipo: "campos", campos: { a: "2" } }]);
  });
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