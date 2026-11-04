import { describe, expect, it } from "vitest";
import { htmlParaTexto } from "./html-texto";

describe("htmlParaTexto", () => {
  it("remove tags e mantém quebras", () => expect(htmlParaTexto("<b>Olá</b><br>mundo &amp; cia")).toBe("Olá\nmundo & cia"));
  it("vazio continua vazio", () => expect(htmlParaTexto("<br>")).toBe(""));
});
