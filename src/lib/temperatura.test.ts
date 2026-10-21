import { describe, expect, it } from "vitest";
import { classeTemperatura, opcoesQuadro, valorOferta } from "./temperatura";

describe("temperatura e totais do kanban", () => {
  it("frio/morno/quente mapeiam para cores; vazio não pinta", () => {
    expect(classeTemperatura("frio")).toBe("bg-temp-frio");
    expect(classeTemperatura("Quente")).toBe("bg-temp-quente");
    expect(classeTemperatura("")).toBeNull();
  });
  it("quadro de suporte com parâmetros desligados não mostra totais nem temperatura", () => {
    expect(opcoesQuadro({ exibir_totais: false, habilitar_temperatura: false }, true)).toEqual({ totais: false, temperatura: false });
    expect(opcoesQuadro({}, false)).toEqual({ totais: false, temperatura: false });
    expect(opcoesQuadro({}, true)).toEqual({ totais: true, temperatura: true });
  });
  it("valor da oferta soma implantação e mensalidade", () => {
    expect(valorOferta({ total_liquido: 8000, total_recorrente: 5000 })).toBe(13000);
  });
});

import { temperaturaEfetiva as te } from "./temperatura";
describe("temperatura automática", () => {
  it("Ativação vira Ganho", () => expect(te("Ativação", "frio")?.label).toBe("Ganho"));
  it("Perdido vira Perdido", () => expect(te("Perdido", "quente")?.label).toBe("Perdido"));
  it("Em andamento mantém escolhida", () => expect(te("Em andamento", "morno")?.label).toBe("Morno"));
});
