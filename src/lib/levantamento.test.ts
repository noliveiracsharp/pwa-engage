import { describe, expect, it } from "vitest";
import { podeDecidir, podeEnviar, podeGerarCotacao, somarDiasUteis } from "./levantamento";

describe("levantamento técnico", () => {
  it("reprovar sem observação é bloqueado", () => {
    expect(podeDecidir("aguardando_aprovacao", "reprovado", "  ")).not.toBeNull();
    expect(podeDecidir("aguardando_aprovacao", "reprovado", "trocar peça")).toBeNull();
  });
  it("só envia com item e permite reenviar após devolução", () => {
    expect(podeEnviar("rascunho", [])).not.toBeNull();
    expect(podeEnviar("reprovado", [{ item_id: "a", quantidade: 2 }])).toBeNull();
    expect(podeEnviar("aguardando_aprovacao", [{ item_id: "a", quantidade: 2 }])).not.toBeNull();
  });
  it("cotação só é liberada após aprovação", () => {
    expect(podeGerarCotacao("aguardando_aprovacao")).toBe(false);
    expect(podeGerarCotacao("aprovado")).toBe(true);
  });
  it("prazo de 1 dia útil na sexta cai na segunda", () => {
    expect(somarDiasUteis(new Date(2026, 9, 30), 1).getDay()).toBe(1);
  });
});
