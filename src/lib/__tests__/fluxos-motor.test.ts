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

describe("subfluxo", () => {
  it("para no bloco e indica o fluxo a executar", () => {
    const r = executarFluxo({
      nos: [
        { id: "g", data: { tipo: "gatilho" } },
        { id: "m", data: { tipo: "mensagem", texto: "Oi" } },
        { id: "s", data: { tipo: "subfluxo", fluxo_id: "F2" } },
      ],
      conexoes: [{ source: "g", target: "m" }, { source: "m", target: "s" }],
      estado: null, texto: "ola",
    });
    expect(r.subfluxo).toBe("F2");
    expect(r.acoes).toEqual([{ tipo: "mensagem", texto: "Oi" }]);
  });
});

describe("blocos HTTP e JavaScript", () => {
  it("motor pausa no bloco http e retoma no próximo bloco", async () => {
    const { proximoNoId } = await import("../fluxos-motor");
    const nos: NoFluxo[] = [
      { id: "g", data: { tipo: "gatilho" } },
      { id: "h", data: { tipo: "http", url: "https://x", variavel: "resposta" } },
      { id: "m", data: { tipo: "mensagem", texto: "Total: {{resposta.itens.1.nome}}" } },
    ];
    const cx: ConexaoFluxo[] = [{ source: "g", target: "h" }, { source: "h", target: "m", sourceHandle: "sucesso" }];
    const r1 = executarFluxo({ nos, conexoes: cx, estado: null, texto: "oi" });
    expect(r1.externo?.no.id).toBe("h");
    const prox = proximoNoId(cx, "h", "sucesso");
    const r2 = executarFluxo({ nos, conexoes: cx, estado: { no_atual: prox, status: "ativo", variaveis: { resposta: '{"itens":[{"nome":"A"},{"nome":"B"}]}' } }, texto: "oi" });
    expect(r2.acoes[0]).toEqual({ tipo: "mensagem", texto: "Total: B" });
  });
  it("JavaScript transforma lista JSON em texto e cria variáveis", async () => {
    const { executarCodigo } = await import("../fluxos-externo");
    const r = executarCodigo(
      { codigo: "return { lista: input.resposta.faturas.map((f, i) => `${i + 1}. ${f.valor}`).join('\\n'), qtd: input.resposta.faturas.length };" },
      { resposta: '{"faturas":[{"valor":"150,00"},{"valor":"90,00"}]}' },
    );
    expect(r.saida).toBe("sucesso");
    expect(r.variaveis["lista"]).toBe("1. 150,00\n2. 90,00");
    expect(r.variaveis["qtd"]).toBe("2");
  });
  it("JavaScript com erro segue pela saída erro", async () => {
    const { executarCodigo } = await import("../fluxos-externo");
    expect(executarCodigo({ codigo: "throw new Error('x')" }, {}).saida).toBe("erro");
  });
  it("HTTP guarda resposta e segue por sucesso/falha conforme status", async () => {
    const { executarHttp } = await import("../fluxos-externo");
    const f = (async () => new Response('{"ok":1}', { status: 200 })) as unknown as typeof fetch;
    const r = await executarHttp({ url: "https://api.exemplo.com/{{id}}", variavel: "api" }, { id: "7" }, f);
    expect(r.saida).toBe("sucesso");
    expect(r.variaveis["api"]).toBe('{"ok":1}');
    const f2 = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    expect((await executarHttp({ url: "https://a.com" }, {}, f2)).saida).toBe("falha");
    expect((await executarHttp({ url: "http://localhost/x" }, {}, f2)).saida).toBe("falha");
  });
});
