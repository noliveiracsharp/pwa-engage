import { describe, expect, it } from "vitest";
import { nomeArquivoSeguro, statusValidade } from "./cond-documentos";

const hoje = new Date(2026, 10, 6);

describe("statusValidade", () => {
  it("sem data de vencimento", () => expect(statusValidade(null, hoje)).toBe("sem"));
  it("vencido quando a data já passou", () => expect(statusValidade("2026-11-05", hoje)).toBe("vencido"));
  it("vencendo hoje ainda é a vencer", () => expect(statusValidade("2026-11-06", hoje)).toBe("a_vencer"));
  it("a vencer dentro de 30 dias", () => expect(statusValidade("2026-12-06", hoje)).toBe("a_vencer"));
  it("válido com mais de 30 dias", () => expect(statusValidade("2026-12-07", hoje)).toBe("valido"));
});

it("nome de arquivo sem acentos nem espaços", () => {
  expect(nomeArquivoSeguro("Ata Assembléia 2026.pdf")).toBe("Ata_Assembleia_2026.pdf");
});
