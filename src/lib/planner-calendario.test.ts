import { describe, expect, it } from "vitest";
import { intervaloDaVista } from "./planner-calendario";
describe("intervaloDaVista", () => {
  it("semana começa na segunda", () => expect(intervaloDaVista("semana", "2026-10-30", "", "")).toMatchObject({ de: "2026-10-26", ate: "2026-11-01" }));
  it("mês cobre do dia 1 ao último", () => expect(intervaloDaVista("mes", "2026-02-10", "", "")).toMatchObject({ de: "2026-02-01", ate: "2026-02-28" }));
  it("personalizado respeita início e fim", () => expect(intervaloDaVista("personalizado", "2026-10-30", "2026-11-05", "2026-11-01")).toMatchObject({ de: "2026-11-01", ate: "2026-11-05" }));
});
import { conflitosBloqueio, foraDoExpediente, type Bloqueio } from "./planner-calendario";
describe("expediente", () => {
  const e = { dias: [1, 2, 3, 4, 5], inicio: "08:00", fim: "18:00" };
  it("terça 09:00 está dentro", () => expect(foraDoExpediente("2026-11-03", 9 * 60, e)).toBe(false));
  it("terça 18:00 está fora", () => expect(foraDoExpediente("2026-11-03", 18 * 60, e)).toBe(true));
  it("terça 07:30 está fora", () => expect(foraDoExpediente("2026-11-03", 7 * 60 + 30, e)).toBe(true));
  it("sábado inteiro está fora", () => expect(foraDoExpediente("2026-11-07", 10 * 60, e)).toBe(true));
});
describe("conflitosBloqueio", () => {
  const b: Bloqueio = { id: "1", usuario_id: "u", inicio: "2026-11-03T13:00:00Z", fim: "2026-11-03T14:00:00Z", titulo: "" };
  it("sobreposição gera conflito", () => expect(conflitosBloqueio([b], "u", new Date("2026-11-03T13:30:00Z"), new Date("2026-11-03T14:30:00Z"))).toHaveLength(1));
  it("encostado no fim não conflita", () => expect(conflitosBloqueio([b], "u", new Date("2026-11-03T14:00:00Z"), new Date("2026-11-03T15:00:00Z"))).toHaveLength(0));
  it("outro usuário não conflita", () => expect(conflitosBloqueio([b], "x", new Date("2026-11-03T13:30:00Z"), new Date("2026-11-03T14:30:00Z"))).toHaveLength(0));
});
