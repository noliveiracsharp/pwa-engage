import { describe, expect, it } from "vitest";
import { termo } from "./i18n-termos";
import { rotuloMenu } from "./i18n-menu";
describe("termos", () => {
  it("traduz campos conhecidos e mantém os demais", () => {
    expect(termo("en-US", "Descrição")).toBe("Description");
    expect(termo("es-ES", "Telefone")).toBe("Teléfono");
    expect(termo("en-US", "Campo inventado")).toBe("Campo inventado");
    expect(termo("pt-BR", "Descrição")).toBe("Descrição");
  });
  it("traduz menu pelo caminho", () => {
    expect(rotuloMenu("en-US", "/itens", "Produtos e Serviços")).toBe("Products & Services");
  });
});
