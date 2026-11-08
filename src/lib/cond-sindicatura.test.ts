import { describe, expect, it } from "vitest";
import { diasParaFimMandato, normalizarSindicatura, papeisNaCarteira, validarSindicatura } from "./cond-sindicatura";

describe("sindicatura", () => {
  it("síndico morador exige unidade", () => {
    expect(validarSindicatura({ modalidade: "morador", sindico_nome: "Ana" })).toMatch(/unidade/);
  });
  it("síndico profissional exige empresa", () => {
    expect(validarSindicatura({ modalidade: "profissional", sindico_nome: "Ana" })).toMatch(/empresa/);
    expect(validarSindicatura({ modalidade: "profissional", sindico_nome: "Ana", empresa_id: "e1" })).toBeNull();
  });
  it("mandato não pode terminar antes de começar", () => {
    expect(validarSindicatura({ modalidade: "profissional", sindico_nome: "A", empresa_id: "e", inicio: "2026-05-01", fim: "2026-01-01" })).toMatch(/mandato/);
  });
  it("trocar para profissional limpa a unidade", () => {
    expect(normalizarSindicatura({ modalidade: "profissional", cond_unidade_id: "u1" }).cond_unidade_id).toBe("");
  });
  it("dias para fim do mandato", () => {
    expect(diasParaFimMandato("2026-11-17", "2026-11-07")).toBe(10);
  });
  it("identifica os papéis do parceiro na carteira", () => {
    expect(papeisNaCarteira("p", { administradora_id: "p", facilities_id: "x" }, "p")).toEqual(["administradora", "sindicatura"]);
  });
});

import { situacaoMandato as sm } from "./cond-sindicatura";
describe("situacaoMandato", () => {
  it("usa 60 dias quando não configurado", () => {
    expect(sm("2026-03-01", "2026-01-15", null)?.situacao).toBe("alerta");
    expect(sm("2026-05-01", "2026-01-15", null)?.situacao).toBe("ok");
  });
  it("respeita a antecedência configurada", () => {
    expect(sm("2026-03-01", "2026-01-15", 30)?.situacao).toBe("ok");
    expect(sm("2026-03-01", "2026-01-15", 90)?.situacao).toBe("alerta");
  });
  it("vencido após o fim", () => {
    expect(sm("2026-01-10", "2026-01-15", 60)).toEqual({ situacao: "vencido", dias: -5 });
  });
  it("sem data de fim não alerta", () => {
    expect(sm(null, "2026-01-15", 60)).toBeNull();
  });
});
