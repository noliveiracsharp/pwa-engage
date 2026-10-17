import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adicionarAviso, limparAvisos, listarAvisos, marcarTodosLidos, removerAviso } from "./avisos";

const projeto = (id: string) => ({ tipo: "projeto" as const, chave: `projeto:${id}`, titulo: "Atividade atribuída", texto: "Teste" });

describe("exclusão de avisos de projetos", () => {
  beforeEach(() => {
    const dados = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => dados.get(key) ?? null,
      setItem: (key: string, value: string) => dados.set(key, value),
    });
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("não recria um aviso apagado nos polls seguintes nem após recarregar o módulo", async () => {
    adicionarAviso(projeto("evento-1"));
    const aviso = listarAvisos()[0];
    expect(aviso).toBeDefined();
    if (!aviso) throw new Error("Aviso não criado");
    removerAviso(aviso.id);
    for (let poll = 0; poll < 3; poll++) adicionarAviso(projeto("evento-1"));
    expect(listarAvisos()).toEqual([]);
    vi.resetModules();
    const recarregado = await import("./avisos");
    recarregado.adicionarAviso(projeto("evento-1"));
    expect(recarregado.listarAvisos()).toEqual([]);
  });

  it("Limpar mantém todos os eventos descartados fora do sino e permite eventos novos", () => {
    adicionarAviso(projeto("evento-1"));
    adicionarAviso(projeto("evento-2"));
    limparAvisos();
    adicionarAviso(projeto("evento-1"));
    adicionarAviso(projeto("evento-2"));
    expect(listarAvisos()).toEqual([]);
    adicionarAviso(projeto("evento-3"));
    expect(listarAvisos().map((a) => [a.chave, a.lido])).toEqual([["projeto:evento-3", false]]);
  });

  it("Ler todos continua lido quando o mesmo evento volta no polling", () => {
    adicionarAviso(projeto("evento-1"));
    marcarTodosLidos();
    adicionarAviso(projeto("evento-1"));
    expect(listarAvisos().map((a) => a.lido)).toEqual([true]);
  });
});