import { describe, expect, it } from "vitest";
import { linkTelefone, linkWhats, linksRota } from "./cond-contatos";
describe("cond-contatos", () => {
  it("emergência curta disca direto", () => expect(linkTelefone("190")).toBe("tel:190"));
  it("fixo com DDD vira +55", () => expect(linkTelefone("(11) 4116-3571")).toBe("tel:+551141163571"));
  it("WhatsApp só para celular", () => {
    expect(linkWhats("(11) 99234-1234")).toBe("https://wa.me/5511992341234");
    expect(linkWhats("011 4116-3571")).toBeNull();
  });
  it("rota usa coordenadas quando houver", () => expect(linksRota(-23.5, -46.6, "x").waze).toBe("https://waze.com/ul?ll=-23.5,-46.6&navigate=yes"));
});
