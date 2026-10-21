import { describe, expect, it } from "vitest";
import { negocioPerdido, statusProximaAcao } from "./crm";

const agora = new Date(2026, 9, 21, 10, 0);

describe("próxima ação", () => {
  it("sem data fica sem ação", () => expect(statusProximaAcao("", "Em andamento", agora)).toBe("sem_acao"));
  it("data passada fica atrasada", () => expect(statusProximaAcao(new Date(2026, 9, 20, 9).toISOString(), "Em andamento", agora)).toBe("atrasada"));
  it("mais tarde hoje fica hoje", () => expect(statusProximaAcao(new Date(2026, 9, 21, 15).toISOString(), "Em andamento", agora)).toBe("hoje"));
  it("negócio perdido não cobra ação", () => expect(statusProximaAcao("", "Perdido", agora)).toBe("encerrado"));
});

describe("perda", () => {
  it("reprovada conta como perdida", () => expect(negocioPerdido("Reprovado")).toBe(true));
  it("em andamento não é perdida", () => expect(negocioPerdido("Em andamento")).toBe(false));
});

import { forecastPonderado, percentualMeta, probabilidadeEtapa, resumoPerdas } from "./crm";

describe("forecast e metas", () => {
  it("usa a probabilidade gravada na etapa", () => expect(probabilidadeEtapa({ probabilidade: 70 }, 0, 5)).toBe(70));
  it("sem probabilidade, 1ª etapa 10% e última 90%", () => {
    expect(probabilidadeEtapa({}, 0, 5)).toBe(10);
    expect(probabilidadeEtapa({}, 4, 5)).toBe(90);
  });
  it("forecast pondera valor pela probabilidade", () =>
    expect(forecastPonderado([{ valor: 10000, probabilidade: 50 }, { valor: 2000, probabilidade: 10 }])).toBe(5200));
  it("meta de 20 mil com 15 mil vendidos = 75%", () => expect(percentualMeta(15000, 20000)).toBe(75));
  it("perdas agrupam por motivo, mais frequente primeiro", () => {
    const r = resumoPerdas([{ motivo: "Preço alto", valor: 100 }, { motivo: "Preço alto", valor: 50 }, { motivo: null, valor: 10 }]);
    expect(r[0]).toEqual({ motivo: "Preço alto", qtd: 2, valor: 150 });
    expect(r[1]!.motivo).toBe("Não informado");
  });
});
