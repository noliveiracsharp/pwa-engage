import { describe, expect, it } from "vitest";
import { valorPorExtenso } from "./recibo";

describe("valorPorExtenso", () => {
  it("escreve o valor do exemplo do cartão", () => {
    expect(valorPorExtenso(9520.22)).toBe("nove mil, quinhentos e vinte reais e vinte e dois centavos");
  });
  it("singular e cem", () => {
    expect(valorPorExtenso(1)).toBe("um real");
    expect(valorPorExtenso(100)).toBe("cem reais");
    expect(valorPorExtenso(0.01)).toBe("um centavo");
  });
  it("mil e redondos", () => {
    expect(valorPorExtenso(1500)).toBe("mil e quinhentos reais");
    expect(valorPorExtenso(2000000)).toBe("dois milhões de reais");
  });
});
