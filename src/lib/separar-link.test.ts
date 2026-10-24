import { describe, expect, it } from "vitest";
import { separarLink } from "@/lib/atendimentos-envio";

describe("separarLink", () => {
  it("tira o link e o rótulo solto para virar botão", () => {
    const r = separarLink("Olá! Aguarda aprovação.\n\nRevise e aprove: https://x.co/cotacoes?id=1");
    expect(r.url).toBe("https://x.co/cotacoes?id=1");
    expect(r.mensagem).toBe("Olá! Aguarda aprovação.");
  });
  it("sem link mantém o texto", () => {
    expect(separarLink("Oi")).toEqual({ mensagem: "Oi", url: null });
  });
});
