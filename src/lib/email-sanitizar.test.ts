import { describe, expect, it } from "vitest";
import { mensagemEmailHtml } from "./regua-cobranca";

describe("mensagem formatada do e-mail", () => {
  it("mantém negrito e cor, mas remove scripts e eventos", () => {
    const h = mensagemEmailHtml('<b style="color:#dc2626">Oi</b><script>x()</script><img src=x onerror="y()">');
    expect(h).toContain('<b style="color:#dc2626">Oi</b>');
    expect(h).not.toContain("script");
    expect(h).not.toContain("onerror");
  });
  it("texto simples continua escapado com quebras de linha", () => {
    expect(mensagemEmailHtml("a < b\nc")).toBe("<p>a &lt; b<br>c</p>");
  });
});
