import { describe, expect, it } from "vitest";
import { formatarMoeda, moedaDeDigitos } from "./input-moeda";

describe("InputMoeda", () => {
  it.each(["pt-BR", "en-US", "es-ES"] as const)("mantém o preço de 1000 em BRL no idioma %s", (idioma) => {
    expect(formatarMoeda(1000, idioma)).toBe(
      new Intl.NumberFormat(idioma, { style: "currency", currency: "BRL" }).format(1000),
    );
  });
  it.each(["pt-BR", "en-US", "es-ES"] as const)("preserva os centavos ao editar em %s", (idioma) => {
    expect(moedaDeDigitos(formatarMoeda(12280.7, idioma))).toBe(12280.7);
  });
});