import { describe, expect, it } from "vitest";
import { cac, ltv, operacao, payback, recorrencia } from "./kpis";

describe("KPIs", () => {
  it("LTV = ticket ÷ churn mensal", () => {
    expect(ltv(150, 1)).toBe(15000);
    expect(ltv(150, 0)).toBe(9000);
  });
  it("CAC soma só categorias de marketing/vendas pagas ÷ novos clientes", () => {
    const t = [
      { tipo: "pagar", categoria: "Marketing", status: "pago", data_pagamento: "2026-10-05", valor: 1000 },
      { tipo: "pagar", categoria: "Aluguel", status: "pago", data_pagamento: "2026-10-05", valor: 5000 },
    ];
    const o = [{ id: "1", parceiro_id: "a", situacao: "ganho", updated_at: "2026-10-10", created_at: "2026-10-01" },
      { id: "2", parceiro_id: "b", situacao: "ganho", updated_at: "2026-10-12", created_at: "2026-10-01" }];
    expect(cac(t, o, "2026-10-01", "2026-10-31")).toEqual({ gasto: 1000, novos: 2, valor: 500 });
  });
  it("payback zero quando a implantação já paga o CAC", () => {
    expect(payback(1000, 1500, 150)).toBe(0);
    expect(payback(1000, 400, 150)).toBe(4);
  });
  it("churn = MRR perdido ÷ MRR inicial", () => {
    const o = [
      { id: "1", situacao: "ganho", total_recorrente: 100, updated_at: "2026-01-01" },
      { id: "2", situacao: "ganho", total_recorrente: 100, updated_at: "2026-01-01", contrato_encerrado_em: "2026-10-15" },
    ];
    const r = recorrencia(o, "2026-10-01", "2026-10-31");
    expect(r.mrr).toBe(100);
    expect(r.churn).toBe(50);
  });
  it("FCR desconta corretiva que voltou em 30 dias no mesmo ativo", () => {
    const os = [
      { tipo: "corretiva", parceiro_id: "a", ativo_id: "x", created_at: "2026-10-01T10:00", concluido_em: "2026-10-01T12:00" },
      { tipo: "corretiva", parceiro_id: "a", ativo_id: "x", created_at: "2026-10-10T10:00", concluido_em: "2026-10-10T11:00" },
    ];
    expect(operacao(os, "2026-10-01", "2026-10-31").fcr).toBe(50);
  });
});
