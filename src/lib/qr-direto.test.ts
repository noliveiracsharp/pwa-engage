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

import { noDoAtalho } from "./qr-direto";
import { executarFluxo } from "./fluxos-motor";
describe("atalho por #tag entra no bloco Kanban", () => {
  const nos = [
    { id: "g", data: { tipo: "gatilho" } },
    { id: "menu", data: { tipo: "menu", texto: "Ajuda?", opcoes: "Comercial\nSuporte" } },
    { id: "com", data: { tipo: "kanban", etapa_id: "lead", atalho: "#oferta" } },
    { id: "sup", data: { tipo: "kanban", etapa_id: "n1" } },
    { id: "bv", data: { tipo: "mensagem", texto: "Boas vindas comercial" } },
  ];
  it("acha o bloco pela tag configurada", () => expect(noDoAtalho(nos, "oferta")).toBe("com"));
  it("sem tag configurada, acha pela etapa do quadro", () => expect(noDoAtalho(nos, "suporte", "n1")).toBe("sup"));
  it("sem bloco correspondente devolve null", () => expect(noDoAtalho(nos, "xyz", "zz")).toBeNull());
  it("pula o menu e continua o fluxo a partir do bloco", () => {
    const r = executarFluxo({ nos: nos as never, conexoes: [{ source: "g", target: "menu" }, { source: "com", target: "bv" }], estado: { no_atual: "com", status: "ativo", variaveis: {} }, texto: "#oferta" });
    expect(r.acoes.map((a) => a.tipo)).toEqual(["etapa", "mensagem"]);
  });
});
