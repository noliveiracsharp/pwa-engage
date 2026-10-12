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

import { statusManutencao } from "./frota";
describe("statusManutencao", () => {
  const hoje = new Date("2026-10-12T12:00:00Z");
  it("troca de óleo a cada 10.000 km feita aos 50.000: aos 59.600 está próxima", () => {
    expect(statusManutencao({ intervalo_km: 10000, ultimo_km: 50000 }, 59600, hoje)).toEqual({ proximoKm: 60000, proximaData: null, status: "proximo" });
  });
  it("aos 60.000 km está vencida", () => {
    expect(statusManutencao({ intervalo_km: 10000, ultimo_km: 50000 }, 60000, hoje).status).toBe("vencido");
  });
  it("a cada 180 dias vence pela data mesmo com KM baixo", () => {
    expect(statusManutencao({ intervalo_km: 10000, ultimo_km: 50000, intervalo_dias: 180, ultima_data: "2026-04-01" }, 51000, hoje).status).toBe("vencido");
  });
  it("longe do vencimento fica ok", () => {
    expect(statusManutencao({ intervalo_km: 10000, ultimo_km: 50000 }, 52000, hoje).status).toBe("ok");
  });
});
