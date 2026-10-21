import { describe, expect, it } from "vitest";
import { agingReceber, concentracao, inadimplencia, prazoMedio, savingCotacoes, taxaConversao } from "./board";

const hoje = "2026-10-20";
const rec = (vencimento: string, valor: number, extra = {}) => ({ tipo: "receber", status: "aberto", vencimento, valor, ...extra });

describe("Painel do Board", () => {
  it("aging separa por faixa de atraso", () => {
    const a = agingReceber([rec("2026-10-25", 100), rec("2026-10-10", 50), rec("2026-09-10", 30), rec("2026-07-01", 20)], hoje);
    expect(a.map((x) => x.valor)).toEqual([100, 50, 0, 30, 20]);
  });
  it("inadimplência considera só vencido há mais de 30 dias", () => {
    expect(inadimplencia([rec("2026-10-25", 50), rec("2026-09-01", 50)], hoje)).toBe(50);
  });
  it("título pago não entra no aging", () => {
    expect(agingReceber([rec("2026-01-01", 100, { status: "pago" })], hoje)[4]!.valor).toBe(0);
  });
  it("prazo médio pondera pelo valor", () => {
    const t = [
      { tipo: "receber", status: "pago", created_at: "2026-10-01", pago_em: "2026-10-11", valor: 100 },
      { tipo: "receber", status: "pago", created_at: "2026-10-01", pago_em: "2026-10-31", valor: 300 },
    ];
    expect(prazoMedio(t, "receber", "2026-10-01", "2026-10-31")).toBe(25);
  });
  it("concentração calcula % e acumulado", () => {
    const c = concentracao([rec("2026-10-01", 75, { parceiro_id: "a" }), rec("2026-10-02", 25, { parceiro_id: "b" })], "receber", "2026-10-01", "2026-10-31");
    expect(c[0]).toMatchObject({ id: "a", pct: 75, acumulado: 75 });
    expect(c[1]!.acumulado).toBe(100);
  });
  it("saving usa o fornecedor escolhido contra o maior preço", () => {
    const s = savingCotacoes(
      [{ id: "i1", quantidade: 2, fornecedor_escolhido_id: "f2" }],
      [{ cotacao_item_id: "i1", fornecedor_id: "f1", preco_unitario: 100 }, { cotacao_item_id: "i1", fornecedor_id: "f2", preco_unitario: 80 }],
    );
    expect(s).toEqual({ valor: 40, pct: 20, base: 200 });
  });
  it("conversão = ganhas / (ganhas + perdidas)", () => {
    expect(taxaConversao(3, 1)).toBe(75);
  });
});
