import { describe, expect, it } from "vitest";
import { calcularTarifa } from "./financeiro-tarifas";
import { mascaraMoeda } from "./input-masks";

const inter = { tarifa_boleto_emissao: 0, tarifa_boleto_baixa: 2.49, franquia_boleto: 100, tarifa_pix: 0.99, franquia_pix: 0 };

describe("tarifas bancárias", () => {
  it("100ª baixa de boleto é isenta pelo pacote", () => {
    expect(calcularTarifa(inter, "Boleto", 99)).toMatchObject({ tarifa: 0, isento: true, sequencia: 100 });
  });
  it("101ª baixa de boleto cobra R$ 2,49", () => {
    expect(calcularTarifa(inter, "Boleto", 100).tarifa).toBe(2.49);
  });
  it("Pix sem franquia cobra R$ 0,99 já no primeiro", () => {
    expect(calcularTarifa(inter, "Pix", 0).tarifa).toBe(0.99);
  });
  it("outras formas não têm tarifa", () => {
    expect(calcularTarifa(inter, "Dinheiro", 500).tarifa).toBe(0);
  });
});

describe("máscara de moeda", () => {
  it("preenche centavos da direita para a esquerda", () => {
    expect(mascaraMoeda("249")).toBe("2,49");
    expect(mascaraMoeda("150000")).toBe("1.500,00");
  });
});
