import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({}) }));
vi.mock("@/lib/crud", () => ({ useTableRows: () => ({ data: [] }) }));
import { buildFlatMenu } from "./useMenu";

const funcoes = [
  { id: "fin", descricao: "Financeiro", path: "/financeiro", ordem: 2 },
  { id: "reemb", descricao: "Reembolsos", path: "/reembolsos", funcoes_pai_id: "fin", ordem: 1 },
  { id: "rel", descricao: "Relatórios", path: "/relatorios", ordem: 3 },
  { id: "relat", descricao: "Relatório de Atendimentos", path: "/relatorios/atendimentos", funcoes_pai_id: "rel" },
];
const it_ = (id: string, path: string, order = 1) => ({ id, label: id, path, icon: "circle", order });

describe("menu lateral plano", () => {
  it("nunca mostra itens filhos no menu", () => {
    const m = buildFlatMenu([it_("fin", "/financeiro", 2), it_("reemb", "/reembolsos")], funcoes);
    expect(m.map((i) => i.path)).toEqual(["/financeiro"]);
    expect(m[0]!.children).toBeUndefined();
  });
  it("acesso só à aba mostra o módulo pai, não o filho solto", () => {
    const m = buildFlatMenu([it_("relat", "/relatorios/atendimentos")], funcoes);
    expect(m.map((i) => i.path)).toEqual(["/relatorios"]);
  });
});
