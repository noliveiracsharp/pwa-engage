import { describe, expect, it } from "vitest";
import { escolherBanner, montarEmailCobrancaHtml, urlSite } from "./regua-cobranca";

const base = { empresaNome: "ACME", cor: "#123456", cliente: "Ana", dias: 0, descricao: "x", valor: 1, vencimento: "2026-10-30", link: "#" };
describe("e-mails: site e banner", () => {
  it("site sem protocolo ganha https://", () => {
    expect(urlSite("acme.com.br")).toBe("https://acme.com.br");
    expect(urlSite("")).toBe("");
  });
  it("link do site abre em nova aba", () => {
    const html = montarEmailCobrancaHtml({ ...base, site: "acme.com.br" });
    expect(html).toContain('href="https://acme.com.br" target="_blank"');
  });
  it("escolhe o banner ativo do contexto com menor prioridade", () => {
    const b = escolherBanner([
      { titulo: "A", url_destino: "x", tipo: "cobranca", prioridade: 1 },
      { titulo: "B", url_destino: "x", tipo: "oferta", prioridade: 0 },
      { titulo: "C", url_destino: "x", tipo: "todos", prioridade: 2 },
      { titulo: "D", url_destino: "x", tipo: "todos", prioridade: -1, ativo: false },
    ], "cobranca");
    expect(b?.titulo).toBe("A");
  });
  it("banner entra no e-mail com link em nova aba", () => {
    const html = montarEmailCobrancaHtml({ ...base, banner: { titulo: "Upgrade", url_destino: "wa.me/551199", texto_botao: "Quero" } });
    expect(html).toContain('href="https://wa.me/551199" target="_blank"');
  });
});
