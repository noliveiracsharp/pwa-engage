import { describe, expect, it } from "vitest";
import { formatadores, normalizarIdioma, traduzir } from "./i18n";

describe("i18n", () => {
  it("português é o padrão para idiomas desconhecidos", () => {
    expect(normalizarIdioma("fr-FR")).toBe("pt-BR");
    expect(normalizarIdioma("en-GB")).toBe("en-US");
  });
  it("traduz com variáveis", () => {
    expect(traduzir("en-US", "tabela.registros", { n: 15 })).toBe("15 records found");
    expect(traduzir("es-ES", "acao.salvar")).toBe("Guardar");
  });
  it("datas seguem o padrão regional", () => {
    expect(formatadores("pt-BR").data("2026-03-05T00:00:00Z")).toBe("05/03/2026");
    expect(formatadores("en-US").data("2026-03-05T00:00:00Z")).toBe("3/5/2026");
  });
  it("moeda em reais no pt-BR", () => {
    expect(formatadores("pt-BR").moeda(1000).replace(/\s/g, " ")).toBe("R$ 1.000,00");
  });
  it.each(["pt-BR", "en-US", "es-ES"] as const)("preserva 1000 reais ao apresentar em %s", (idioma) => {
    const esperado = new Intl.NumberFormat(idioma, { style: "currency", currency: "BRL" }).format(1000);
    expect(formatadores(idioma).moeda(1000)).toBe(esperado);
  });
  it("respeita moeda explicitamente informada independentemente do idioma", () => {
    expect(formatadores("en-US", "EUR").moeda(1000)).toBe("€1,000.00");
  });
});
