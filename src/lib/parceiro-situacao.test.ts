import { describe, expect, it } from "vitest";
import { problemaParceiro } from "@/components/financeiro/ParceiroSituacaoAlerta";

describe("problemaParceiro", () => {
  it("alerta quando a Receita não está ATIVA", () => {
    expect(problemaParceiro({ situacao_cadastral: "BAIXADA", status: true })).toBe("situação BAIXADA na Receita Federal");
  });
  it("alerta quando o cadastro está inativo", () => {
    expect(problemaParceiro({ situacao_cadastral: "ATIVA", status: false })).toBe("cadastro inativo no sistema");
  });
  it("não alerta parceiro ativo", () => {
    expect(problemaParceiro({ situacao_cadastral: "ATIVA", status: true })).toBeNull();
  });
});
