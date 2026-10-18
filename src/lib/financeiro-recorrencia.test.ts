import { describe, expect, it } from "vitest";
import { alvosRecorrencia, patchRecorrencia } from "./financeiro-recorrencia";

const atual = { id: "1", empresa_id: "e1", origem_id: "s1", origem_tipo: "manual", tipo: "pagar", status: "aberto", vencimento: "2026-10-10" };
const titulos = [atual,
  { ...atual, id: "2", vencimento: "2026-10-18" },
  { ...atual, id: "3", vencimento: "2026-11-10" },
  { ...atual, id: "4", status: "pago", pago_em: "2026-10-01" },
  { ...atual, id: "5", valor_pago: 10 },
  { ...atual, id: "6", status: "cancelado" },
  { ...atual, id: "7", empresa_id: "e2" },
  { ...atual, id: "8", origem_id: "s2" },
];
describe("edição recorrente", () => {
  it("somente o lançamento atual", () => expect(alvosRecorrencia(atual, titulos, "atual", "2026-10-18").map(t => t.id)).toEqual(["1"]));
  it("atual e não vencidos sem baixas, incluindo hoje", () => expect(alvosRecorrencia(atual, titulos, "nao_vencidos", "2026-10-18").map(t => t.id)).toEqual(["1", "2", "3"]));
  it("atual e todos abertos sem baixas, vencidos ou não", () => expect(alvosRecorrencia(atual, titulos, "abertos", "2026-11-18").map(t => t.id)).toEqual(["1", "2", "3"]));
  it("todos apenas da mesma série e empresa", () => expect(alvosRecorrencia(atual, titulos, "todos", "2026-10-18").map(t => t.id)).toEqual(["1", "2", "3", "4", "5", "6"]));
  it("não agrupa antigos sem identificador", () => expect(alvosRecorrencia({ ...atual, origem_id: null }, [{ ...atual, origem_id: null }, { ...atual, id: "2", origem_id: null }], "todos", "2026-10-18")).toHaveLength(1));
  it("preserva datas distintas e valores de baixa", () => {
    expect(patchRecorrencia({ ...atual, valor: 100 }, { ...atual, id: "2", vencimento: "2026-11-10", status: "pago", valor_pago: 100 }, { vencimento: "2026-10-12", valor: 120, status: "cancelado" })).toEqual({ vencimento: "2026-11-12", valor: 120 });
  });
  it("preserva o número da parcela na descrição", () => expect(patchRecorrencia({ ...atual, descricao: "Aluguel (1/3)" }, { ...atual, id: "2", descricao: "Aluguel (2/3)" }, { descricao: "Locação (1/3)" })).toEqual({ descricao: "Locação (2/3)" }));
});