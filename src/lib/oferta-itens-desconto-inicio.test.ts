import { describe, expect, it } from "vitest";
import { calcLinha } from "@/lib/orcamentos";
import { titulosDaOferta } from "@/lib/financeiro";

describe("desconto em R$ por item da Oferta", () => {
  it("abate o desconto do total da linha", () => {
    const c = calcLinha({ quantidade: "2", valor_unitario: "100", preco_custo: 0, imposto_pct: 0, desconto_linha: "30" });
    expect(c.total_linha).toBe(170);
  });
  it("não deixa o desconto passar do valor da linha", () => {
    expect(calcLinha({ quantidade: "1", valor_unitario: "50", preco_custo: 0, imposto_pct: 0, desconto_linha: "80" }).total_linha).toBe(0);
  });
});

describe("início de cobrança por item recorrente", () => {
  it("cada item mensal começa na sua própria data", () => {
    const orc = { id: "o1", numero: "2026-1", parceiro_id: "c1", total_recorrente: 300, vigencia_meses: 2, dt_primeiro_faturamento: "2026-11-10", parcelas: [] };
    const itens = [
      { natureza: "recorrente", total_linha: 100, dt_inicio_faturamento: "2026-11-01" },
      { natureza: "recorrente", total_linha: 200, dt_inicio_faturamento: "2026-12-15" },
    ];
    const mens = titulosDaOferta(orc, itens).filter((t) => t.categoria === "Mensalidade de contrato");
    expect(mens.map((t) => [t.vencimento, t.valor])).toEqual([
      ["2026-11-01", 100], ["2026-12-15", 200], ["2026-12-01", 100], ["2027-01-15", 200],
    ]);
  });
});
