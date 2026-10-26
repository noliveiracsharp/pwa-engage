import { describe, expect, it } from "vitest";
import { ehDiretoComercial, linkDiretoComercial } from "./qr-direto";

describe("QR direto para o Comercial", () => {
  it("reconhece a marca e ignora mensagens comuns", () => {
    expect(ehDiretoComercial("Olá [#COMERCIAL]")).toBe(true);
    expect(ehDiretoComercial("quero falar com o comercial")).toBe(false);
  });
  it("gera link wa.me só com dígitos e a marca no texto", () => {
    const l = linkDiretoComercial("+55 (11) 99999-0000", "Oi");
    expect(l.startsWith("https://wa.me/5511999990000?text=")).toBe(true);
    expect(ehDiretoComercial(decodeURIComponent(l.split("text=")[1]!))).toBe(true);
  });
});
