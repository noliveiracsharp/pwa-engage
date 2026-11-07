import { describe, expect, it } from "vitest";
import { dataBrParaIso, exigeAceite, funcaoPadrao, funcoesDoPapel, podeDelegarSindico, isoParaBr, mascaraData, preferenciasDoPapel, valoresPreferencias } from "./cond-pessoa";

const cat = [
  { chave: "boleto_email", descricao: "Boleto", publico: "titular", padrao: true, ordem: 3 },
  { chave: "whatsapp", descricao: "WhatsApp", publico: "todos", padrao: true, ordem: 2 },
  { chave: "anuncios", descricao: "Anúncios", publico: "familiar", padrao: false, ordem: 8 },
];

describe("datas de nascimento", () => {
  it("converte dd/mm/aaaa para ISO e volta", () => {
    expect(dataBrParaIso("25/06/1985")).toBe("1985-06-25");
    expect(isoParaBr("1985-06-25")).toBe("25/06/1985");
  });
  it("rejeita datas inexistentes", () => {
    expect(dataBrParaIso("31/02/2000")).toBe("");
  });
  it("aplica a máscara enquanto digita", () => {
    expect(mascaraData("25061985")).toBe("25/06/1985");
  });
});

describe("preferências por papel", () => {
  it("titular vê as de titular e as gerais, não as de familiar", () => {
    expect(preferenciasDoPapel(cat, "proprietario").map((p) => p.chave)).toEqual(["whatsapp", "boleto_email"]);
  });
  it("familiar não vê aviso de boleto", () => {
    expect(preferenciasDoPapel(cat, "familiar").map((p) => p.chave)).toEqual(["whatsapp", "anuncios"]);
  });
  it("usa o padrão do catálogo quando nunca respondido", () => {
    expect(valoresPreferencias(cat, { whatsapp: false })).toEqual({ boleto_email: true, whatsapp: false, anuncios: false });
  });
});

describe("função no condomínio por papel", () => {
  it("prestador nunca é condômino e não recebe permissão de síndico", () => {
    expect(funcaoPadrao("prestador", "condomino")).toBe("prestador_servico");
    expect(funcoesDoPapel("prestador").map((f) => f.value)).not.toContain("sindico");
    expect(podeDelegarSindico("prestador")).toBe(false);
  });
  it("proprietário mantém condômino como padrão", () => {
    expect(funcaoPadrao("proprietario", null)).toBe("condomino");
    expect(podeDelegarSindico("proprietario")).toBe(true);
  });
});

describe("aceite do regimento", () => {
  it("titular sem aceite precisa aceitar para salvar", () => {
    expect(exigeAceite("inquilino", null)).toBe(true);
    expect(exigeAceite("inquilino", "2026-01-01T00:00:00Z")).toBe(false);
  });
  it("familiar não precisa", () => {
    expect(exigeAceite("familiar", null)).toBe(false);
  });
});
