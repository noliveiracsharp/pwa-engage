import { describe, expect, it } from "vitest";
import { lerJornada, minutosUteis, statusSla } from "./sla-etapa";

const agora = new Date("2026-11-10T12:00:00Z");
const ha = (min: number) => new Date(agora.getTime() - min * 60000).toISOString();

describe("SLA por etapa", () => {
  it("etapa sem SLA não sinaliza", () => expect(statusSla(ha(500), null, agora).estado).toBe("sem_sla"));
  it("dentro do prazo fica ok", () => expect(statusSla(ha(60), 2, agora)).toEqual({ estado: "ok", restanteMin: 60 }));
  it("a partir de 80% do prazo fica em atenção", () => expect(statusSla(ha(96), 2, agora).estado).toBe("atencao"));
  it("passou do prazo fica estourado", () => expect(statusSla(ha(150), 2, agora)).toEqual({ estado: "estourado", restanteMin: -30 }));
});

describe("SLA em horário comercial", () => {
  const com = { modo: "comercial" as const, dias: [1, 2, 3, 4, 5], inicio: "09:00", fim: "18:00" };
  // Sexta 06/11/2026 17:00 de Brasília = 20:00Z
  const sexta17 = "2026-11-06T20:00:00Z";
  it("4h úteis a partir de sexta 17h vencem segunda 12h", () => {
    expect(statusSla(sexta17, 4, new Date("2026-11-09T14:59:00Z"), com).estado).not.toBe("estourado"); // seg 11:59
    expect(statusSla(sexta17, 4, new Date("2026-11-09T15:00:00Z"), com).estado).toBe("estourado"); // seg 12:00
  });
  it("fim de semana não conta", () => expect(minutosUteis(Date.parse("2026-11-07T12:00:00Z"), Date.parse("2026-11-08T23:00:00Z"), com)).toBe(0));
  it("24h conta direto o fim de semana", () => expect(statusSla(sexta17, 4, new Date("2026-11-07T00:00:00Z")).estado).toBe("estourado"));
  it("jornada inválida vira 24h", () => expect(lerJornada({ modo: "comercial", dias: [], inicio: "09:00", fim: "18:00" })).toEqual({ modo: "24h" }));
});
