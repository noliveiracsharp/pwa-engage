import { describe, expect, it } from "vitest";
import { ehCortesia } from "./csat";
describe("ehCortesia", () => {
  it("reconhece despedidas curtas", () => {
    for (const t of ["Igualmente", "obrigado!", "Valeu, tchau", "Muito obrigada", "boa tarde", "Pra você também"]) expect(ehCortesia(t)).toBe(true);
  });
  it("não engole pedidos reais", () => {
    for (const t of ["Preciso de ajuda com boleto", "obrigado, mas o sistema caiu", "quero falar com o financeiro"]) expect(ehCortesia(t)).toBe(false);
  });
});
