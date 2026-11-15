import { describe, expect, it } from "vitest";
import { validarAntecedencia } from "./assembleias";
const agora = new Date(2026, 10, 15, 10, 0);
const base = { tipo: "AGE", minAgo: 10, minAge: 8, emergencial: false, agora };
describe("antecedência de convocação", () => {
  it("bloqueia AGE com menos dias que o mínimo", () => expect(validarAntecedencia({ ...base, dataHora: new Date(2026, 10, 20, 19).toISOString() }).ok).toBe(false));
  it("aceita AGE no mínimo exato", () => expect(validarAntecedencia({ ...base, dataHora: new Date(2026, 10, 23, 19).toISOString() }).ok).toBe(true));
  it("usa o mínimo da AGO", () => expect(validarAntecedencia({ ...base, tipo: "AGO", dataHora: new Date(2026, 10, 23, 19).toISOString() }).ok).toBe(false));
  it("emergencial exige justificativa", () => expect(validarAntecedencia({ ...base, emergencial: true, dataHora: new Date(2026, 10, 16).toISOString() }).ok).toBe(false));
  it("emergencial com justificativa dispensa prazo", () => expect(validarAntecedencia({ ...base, emergencial: true, justificativa: "Vazamento", dataHora: new Date(2026, 10, 16).toISOString() }).ok).toBe(true));
});
