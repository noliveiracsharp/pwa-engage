import { describe, expect, it } from "vitest";
import { validarMembro, vigente, vinculoPadrao } from "./cond-equipe";

describe("equipe do condomínio", () => {
  it("síndico morador exige unidade", () => {
    expect(validarMembro({ nome: "Ana", cargo: "sindico_morador", vinculo: "morador" })).toBe("Informe a unidade do morador.");
    expect(validarMembro({ nome: "Ana", cargo: "sindico_morador", vinculo: "morador", cond_unidade_id: "u1" })).toBeNull();
  });
  it("terceiro exige empresa", () => {
    expect(validarMembro({ nome: "Rui", cargo: "sindico_profissional", vinculo: "terceiro" })).toBe("Informe a empresa do terceiro.");
  });
  it("fim antes do início é inválido", () => {
    expect(validarMembro({ nome: "Rui", cargo: "zelador", vinculo: "proprio", inicio: "2026-05-01", fim: "2026-01-01" })).not.toBeNull();
  });
  it("vínculo sugerido por cargo", () => {
    expect(vinculoPadrao("porteiro")).toBe("facilities");
    expect(vinculoPadrao("sindico_morador")).toBe("morador");
  });
  it("mandato vencido não está vigente", () => {
    expect(vigente({ inicio: "2024-01-01", fim: "2025-12-31" }, "2026-11-05")).toBe(false);
    expect(vigente({ inicio: "2026-01-01", fim: null }, "2026-11-05")).toBe(true);
  });
});
