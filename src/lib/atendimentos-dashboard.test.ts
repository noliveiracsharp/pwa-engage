import { describe, expect, it } from "vitest";
import { agruparPor, calcularMetricas, type ItemMetrica } from "./atendimentos-dashboard";
const i = (o: Partial<ItemMetrica>): ItemMetrica => ({ atendente: "Ana", departamento: "Suporte", nota: 0, encerrado: true, duracaoMin: null, sla: null, ...o });
describe("dashboard de atendimentos", () => {
  it("média de nota ignora encerrados sem avaliação", () => {
    expect(calcularMetricas([i({ nota: 5 }), i({ nota: 3 }), i({ nota: 0 })]).mediaNota).toBe(4);
  });
  it("tempo médio usa só encerrados", () => {
    expect(calcularMetricas([i({ duracaoMin: 10 }), i({ duracaoMin: 30 }), i({ encerrado: false, duracaoMin: 999 })]).tempoMedioMin).toBe(20);
  });
  it("SLA cumprido conta abertos não estourados", () => {
    const m = calcularMetricas([i({ encerrado: false, sla: "ok" }), i({ encerrado: false, sla: "atencao" }), i({ encerrado: false, sla: "estourado" }), i({ encerrado: false, sla: "estourado" })]);
    expect(m.pctSla).toBe(50);
  });
  it("agrupa por atendente", () => {
    const g = agruparPor([i({ atendente: "Bia", nota: 4 }), i({ nota: 2 })], "atendente");
    expect(g.map((x) => [x.nome, x.mediaNota])).toEqual([["Ana", 2], ["Bia", 4]]);
  });
});
