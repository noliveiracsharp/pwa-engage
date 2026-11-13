import { describe, expect, it } from "vitest";
import { antecedencia, nomeArquivoSeguro, quadroVencimentos, statusValidade } from "./cond-documentos";

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

describe("antecedência por documento", () => {
  const hoje = new Date(2026, 10, 6);
  it("AVCB com 90 dias entra em alerta 90 dias antes", () => expect(statusValidade("2027-02-04", hoje, 90)).toBe("a_vencer"));
  it("com 90 dias, 91 dias antes ainda é válido", () => expect(statusValidade("2027-02-05", hoje, 90)).toBe("valido"));
  it("com 15 dias, 16 dias antes é válido", () => expect(statusValidade("2026-11-22", hoje, 15)).toBe("valido"));
  it("vazio usa 30", () => expect(antecedencia("")).toBe(30));
  it("quadro ordena do mais urgente e ignora válidos", () => {
    const q = quadroVencimentos([
      { id: "a", data_vencimento: "2026-12-01", dias_antecedencia: 60 },
      { id: "b", data_vencimento: "2026-11-01" },
      { id: "c", data_vencimento: "2027-06-01", dias_antecedencia: 30 },
    ], hoje);
    expect(q.map((x) => x.id)).toEqual(["b", "a"]);
  });
});
