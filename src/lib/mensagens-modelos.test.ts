import { describe, expect, it } from "vitest";
import { MODELOS, aplicarModelo } from "./mensagens-modelos";

const padrao = MODELOS.find((m) => m.chave === "cotacao_fornecedor")!.padrao;

describe("modelo de cotação", () => {
  it("inclui o aviso em negrito e assinatura do comprador", () => {
    const t = aplicarModelo(padrao, { fornecedor: "ACME", numero: "COT-2026-006", link: "https://x/c/1", comprador: "Ana", comprador_whatsapp: "(11) 9999-0000" });
    expect(t).toContain("*Cotações só serão aceitas se preenchidas pelo formulário anexo.*");
    expect(t).toContain("Ana — WhatsApp (11) 9999-0000");
  });
  it("remove a assinatura vazia quando não há comprador", () => {
    const t = aplicarModelo(padrao, { fornecedor: "ACME", numero: "1", link: "l", comprador: "", comprador_whatsapp: "" });
    expect(t.endsWith("ficamos à disposição.")).toBe(true);
  });
});
