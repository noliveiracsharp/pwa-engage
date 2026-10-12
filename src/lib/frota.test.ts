import { describe, expect, it } from "vitest";
import { consumoReal, desvioConsumo } from "./frota";

const a = (km: number, litros: number, tanque_cheio = true) => ({ km, litros, tanque_cheio, data: "" });

describe("consumoReal", () => {
  it("km desde o último tanque cheio dividido pelos litros", () => {
    expect(consumoReal([a(10000, 40)], a(10400, 40))).toBe(10);
  });
  it("soma abastecimentos parciais intermediários", () => {
    expect(consumoReal([a(10000, 40), a(10200, 10, false)], a(10500, 40))).toBe(10);
  });
  it("sem tanque cheio anterior não calcula", () => {
    expect(consumoReal([a(10000, 40, false)], a(10400, 40))).toBeNull();
  });
  it("abastecimento parcial não calcula", () => {
    expect(consumoReal([a(10000, 40)], a(10400, 40, false))).toBeNull();
  });
});

describe("desvioConsumo", () => {
  it("real 8,5 contra esperado 10 = -15%", () => {
    expect(desvioConsumo(8.5, 10)).toBe(-15);
  });
});
