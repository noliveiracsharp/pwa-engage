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
