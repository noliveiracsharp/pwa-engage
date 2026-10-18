import { describe, expect, it } from "vitest";
import { diasParaVencer, MODELOS_PADRAO, renderModelo, variaveisDe } from "./documentos";

describe("documentos", () => {
  it("preenche variáveis e deixa linha nas que faltam", () => {
    expect(renderModelo("Eu, {{nome}}, CPF {{cpf}}", { nome: "Ana" })).toBe("Eu, Ana, CPF ________________");
  });

  it("monta variáveis do usuário e da empresa", () => {
    const v = variaveisDe("usuario", { nome: "Ana", cpf: "123" }, { razao_social: "ACME LTDA", cnpj: "1" }, new Date(2026, 9, 18));
    expect(v["nome"]).toBe("Ana");
    expect(v["empresa_razao"]).toBe("ACME LTDA");
    expect(v["data_hoje"]).toBe("18/10/2026");
  });

  it("calcula dias para vencer", () => {
    expect(diasParaVencer("2026-10-20", new Date(2026, 9, 18))).toBe(2);
    expect(diasParaVencer("2026-10-10", new Date(2026, 9, 18))).toBe(-8);
  });

  it("traz os 6 documentos pedidos entre os modelos padrão", () => {
    const t = MODELOS_PADRAO.map((m) => m.titulo).join("|");
    for (const k of ["Fornecimento", "Prestação de Serviços", "Estágio", "Veículo", "Celular", "Equipamentos"]) expect(t).toContain(k);
  });
});
