import { describe, expect, it } from "vitest";
import { camposFiscais, rotulosFiscais } from "./titulo-fiscal";

const vazio = { nfe_numero: "", nfe_serie: "", nfe_valor: "", nfse_numero: "", nfse_rps: "", nfse_valor: "" };

describe("documentos fiscais do lançamento", () => {
  it("não envia colunas fiscais quando nada foi preenchido", () => {
    expect(camposFiscais(vazio, null)).toEqual({});
  });
  it("separa valores de NF-e e NFS-e", () => {
    const r = camposFiscais({ ...vazio, nfe_numero: "1042", nfe_valor: "2.000,00", nfse_numero: "389", nfse_valor: "3.000,00" });
    expect(r["nfe_valor"]).toBe(2000);
    expect(r["nfse_valor"]).toBe(3000);
  });
  it("mostra selo NFS-e com RPS", () => {
    expect(rotulosFiscais({ nfse_numero: "389", nfse_rps: "374" })).toEqual(["NFS-e: 389 / RPS: 374"]);
  });
});
