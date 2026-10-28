import { beforeEach, describe, expect, it, vi } from "vitest";

const banco = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], nextId: 0 }));
vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/audit", () => ({ useAudit: () => ({ stamp: (row: unknown) => row, usuarioId: "usuario" }) }));
vi.mock("@/lib/crud", () => ({ idColumn: () => "id", rowId: (row: Record<string, unknown>) => row["id"] }));
vi.mock("@/lib/orcamento-kanban", () => ({ vincularKanban: async (header: unknown) => header }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      let operation = "select";
      let payload: Record<string, unknown> | Record<string, unknown>[] = {};
      let filter: [string, unknown] | undefined;
      let removed: string[] = [];
      let ordered = false;
      const query = {
        select: (_columns: string) => query,
        update: (value: Record<string, unknown>) => { operation = "update"; payload = value; return query; },
        insert: (value: Record<string, unknown>[]) => { operation = "insert"; payload = value; return query; },
        delete: () => { operation = "delete"; return query; },
        eq: (key: string, value: unknown) => { filter = [key, value]; return query; },
        in: (_key: string, ids: string[]) => { removed = ids; return query; },
        order: () => { ordered = true; return query; },
        then: (resolve: (result: { data: Record<string, unknown>[]; error: null }) => unknown) => {
          if (table !== "orcamento_itens") return Promise.resolve(resolve({ data: [], error: null }));
          if (operation === "delete") banco.rows = banco.rows.filter((row) => !removed.includes(String(row["id"])));
          if (operation === "update") banco.rows = banco.rows.map((row) => filter && row[filter[0]] === filter[1] ? { ...row, ...payload } : row);
          if (operation === "insert") for (const row of Array.isArray(payload) ? payload : [payload]) banco.rows.push({ ...row, id: `novo-${++banco.nextId}` });
          const rows = banco.rows.filter((row) => !filter || row[filter[0]] === filter[1]).map((row) => ({ ...row }));
          if (ordered) rows.sort((a, b) => Number(a["ordem"]) - Number(b["ordem"]));
          return Promise.resolve(resolve({ data: rows, error: null }));
        },
      };
      return query;
    },
  },
}));

import { useSaveOrcamento, type LinhaPayload, type SaveOrcamentoInput } from "./useSaveOrcamento";

const linha = (id?: string): LinhaPayload => ({ id, ordem: 1, item_id: "camera", detalhe: null, quantidade: 3, unidade_medida_id: null, valor_unitario: 150, total_linha: 450, preco_custo: 80, imposto_pct: 0, imposto_valor: 0, custo_total: 240, lucro: 210, margem_pct: 46.67 });
const executar = () => (useSaveOrcamento() as unknown as { mutationFn: (input: SaveOrcamentoInput) => Promise<{ linhas: Record<string, unknown>[] }> }).mutationFn;

describe("persistência de itens na Rev. 2", () => {
  beforeEach(() => {
    banco.nextId = 0;
    banco.rows = [
      { id: "removido", orcamento_id: "oferta", ordem: 1, quantidade: 1 },
      { id: "mantido", orcamento_id: "oferta", ordem: 2, quantidade: 1, valor_unitario: 100 },
    ];
  });
  it("exclui o item removido e devolve quantidade e preço efetivamente gravados", async () => {
    const resultado = await executar()({ header: {}, original: { id: "oferta", versao_atual: 2 }, linhas: [linha("mantido")] });
    expect(banco.rows.map((row) => row["id"])).toEqual(["mantido"]);
    expect(resultado.linhas).toHaveLength(1);
    expect(resultado.linhas[0]).toMatchObject({ id: "mantido", quantidade: 3, valor_unitario: 150 });
  });
  it("devolve o ID novo e permite salvar novamente sem reinserir o item", async () => {
    const mutation = executar();
    const resultado = await mutation({ header: {}, original: { id: "oferta", versao_atual: 2 }, linhas: [linha()] });
    expect(resultado.linhas[0]?.["id"]).toBe("novo-1");
    await mutation({ header: {}, original: { id: "oferta", versao_atual: 2 }, linhas: [linha(String(resultado.linhas[0]?.["id"]))] });
    expect(banco.rows.map((row) => row["id"])).toEqual(["novo-1"]);
    expect(banco.nextId).toBe(1);
  });
});