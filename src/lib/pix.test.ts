import { describe, expect, it } from "vitest";
import { crc16, gerarPixCopiaECola } from "./pix";

describe("pix", () => {
  it("CRC16 do vetor padrão 123456789 é 29B1", () => expect(crc16("123456789")).toBe("29B1"));
  it("gera BR Code com valor, chave e CRC válido", () => {
    const p = gerarPixCopiaECola({ chave: "12.345.678/0001-90", nome: "Conectcon Ltda", cidade: "São Paulo", valor: 1500, txid: "TIT-001" });
    expect(p).toContain("0014br.gov.bcb.pix0114" + "12345678000190");
    expect(p).toContain("54071500.00");
    expect(p).toContain("6009SAO PAULO");
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
  });
  it("sem chave falha", () => expect(() => gerarPixCopiaECola({ chave: "", nome: "x", cidade: "y" })).toThrow());
});
