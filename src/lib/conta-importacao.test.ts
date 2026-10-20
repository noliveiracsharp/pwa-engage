import { describe, expect, it } from "vitest";
import { lerLinhaDigitavel, lerTextoConta, lerXmlNfe, vencimentoDoFator } from "./conta-importacao";

describe("importação de contas", () => {
  it("fator 1000 = 22/02/2025 (novo ciclo)", () => {
    expect(vencimentoDoFator(1000)).toBe("2025-02-22");
    expect(vencimentoDoFator(1001)).toBe("2025-02-23");
  });
  it("boleto 47 dígitos: valor e vencimento", () => {
    const r = lerLinhaDigitavel("00190.00009 01234.567890 12345.678901 1 10000000150000");
    expect(r?.tipo).toBe("boleto");
    expect(r?.valor).toBe(1500);
    expect(r?.vencimento).toBe("2025-02-22");
  });
  it("conta de consumo 48 dígitos: valor", () => {
    const r = lerLinhaDigitavel("836200000005 123400481003 000000000000 000000000000");
    expect(r?.tipo).toBe("consumo");
    expect(r?.valor).toBe(512.34);
  });
  it("PDF sem linha: usa vencimento e valor do texto", () => {
    const r = lerTextoConta("Vencimento 10/11/2026\nValor do documento R$ 1.234,56\nCNPJ 12.345.678/0001-90");
    expect(r.parcelas).toEqual([{ vencimento: "2026-11-10", valor: 1234.56 }]);
    expect(r.cnpj).toBe("12345678000190");
  });
  it("NF-e XML com duplicatas", () => {
    const xml = `<nfeProc><infNFe><ide><nNF>123</nNF><dhEmi>2026-10-01T10:00:00-03:00</dhEmi></ide><emit><CNPJ>11222333000144</CNPJ><xNome>ACME LTDA</xNome></emit>
      <total><ICMSTot><vNF>300.00</vNF></ICMSTot></total><cobr><dup><nDup>001</nDup><dVenc>2026-11-01</dVenc><vDup>150.00</vDup></dup><dup><nDup>002</nDup><dVenc>2026-12-01</dVenc><vDup>150.00</vDup></dup></cobr></infNFe></nfeProc>`;
    const r = lerXmlNfe(xml)!;
    expect(r.fornecedor).toBe("ACME LTDA");
    expect(r.numero).toBe("123");
    expect(r.parcelas).toHaveLength(2);
    expect(r.parcelas[1]).toEqual({ vencimento: "2026-12-01", valor: 150 });
  });
});
