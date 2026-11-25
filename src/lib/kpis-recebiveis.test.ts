import { describe, expect, it } from "vitest";
import { recorrenciaRecebiveis } from "./kpis-recebiveis";

describe("recorrência da carteira migrada sem Ofertas", () => {
  const rows = [
    { mes: "2026-10-01", cliente_id: "a", valor_mensal: 100 },
    { mes: "2026-11-01", cliente_id: "a", valor_mensal: 150 },
    { mes: "2026-11-01", cliente_id: "b", valor_mensal: 250 },
    { mes: "2026-12-01", cliente_id: "b", valor_mensal: 250 },
  ];
  it("usa apenas o mês final, sem somar as parcelas de todo o período", () => {
    expect(recorrenciaRecebiveis(rows, "2026-11-25").mrr).toBe(400);
  });
  it("projeta ARR como MRR vezes 12", () => {
    expect(recorrenciaRecebiveis(rows, "2026-11-25").arr).toBe(4800);
  });
  it("conta clientes distintos e calcula ticket por cliente", () => {
    const r = recorrenciaRecebiveis([...rows, { mes: "2026-11-01", cliente_id: "a", valor_mensal: 100 }], "2026-11-25");
    expect(r.clientes).toBe(2);
    expect(r.ticket).toBe(250);
  });
  it("não declara churn zero quando o histórico de contratos não existe", () => {
    expect(recorrenciaRecebiveis(rows, "2026-12-25").churn).toBeNull();
  });
  it("LTV sem histórico é explicitamente uma estimativa de 60 meses", () => {
    expect(recorrenciaRecebiveis(rows, "2026-11-25").ltv).toBe(12000);
  });
});