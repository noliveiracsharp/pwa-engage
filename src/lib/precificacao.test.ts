import { describe, it, expect } from "vitest";
import { custoHoraTecnica, custoServico, pontoEquilibrio } from "./precificacao";

describe("precificação", () => {
  it("hora técnica: R$3.000 + 70% encargos, 176h a 70% → R$41,40", () => {
    expect(custoHoraTecnica({ salario: 3000, encargosPct: 70, beneficios: 0, horasMes: 176, eficienciaPct: 70 })).toBe(41.4);
  });
  it("hora técnica sem horas faturáveis é indefinida", () => {
    expect(custoHoraTecnica({ salario: 3000, encargosPct: 70, beneficios: 0, horasMes: 176, eficienciaPct: 0 })).toBeNull();
  });
  it("custo do serviço soma horas × custo/hora + extras", () => {
    expect(custoServico(3, 42.5, 20)).toBe(147.5);
  });
  it("ponto de equilíbrio: fixas 30 mil com MC 40% → 75 mil", () => {
    expect(pontoEquilibrio(100000, 60000, 30000)).toEqual({ mc: 40000, mcPct: 40, pe: 75000 });
  });
  it("sem margem de contribuição não há ponto de equilíbrio", () => {
    expect(pontoEquilibrio(100, 120, 50).pe).toBeNull();
  });
});
