import { describe, expect, it } from "vitest";
import { extrairTagAcesso, linkAcessoKanban, tagDoKanban } from "./qr-direto";

describe("Atalho #kanban", () => {
  it("reconhece #tag solta ou entre colchetes", () => {
    expect(extrairTagAcesso("#comercial")).toBe("comercial");
    expect(extrairTagAcesso("Olá [#OFERTA]")).toBe("oferta");
    expect(extrairTagAcesso("quero falar com o comercial")).toBeNull();
  });
  it("normaliza acentos e espaços", () => {
    expect(tagDoKanban("Suporte Técnico")).toBe("suportetecnico");
  });
  it("gera link wa.me com a tag do Kanban", () => {
    const l = linkAcessoKanban("+55 (11) 99999-0000", "Oi", "Oferta");
    expect(l.startsWith("https://wa.me/5511999990000?text=")).toBe(true);
    expect(extrairTagAcesso(decodeURIComponent(l.split("text=")[1]!))).toBe("oferta");
  });
});
