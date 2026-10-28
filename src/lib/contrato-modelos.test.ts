import { describe, expect, it } from "vitest";
import { gerarContratoModular, modeloPadraoContrato } from "@/lib/propostas";

const base = { orcamento: { vigencia_meses: 12, reajuste_indice: "IGPM" }, linhas: [], itens: [] };

describe("contrato da Oferta com modelo da empresa", () => {
  it("sem modelo usa o texto padrão", () => {
    expect(gerarContratoModular({ ...base, anexos: [] })).toContain("Condições gerais de prestação");
  });
  it("modelo personalizado substitui a seção e preenche as variáveis do contrato", () => {
    const html = gerarContratoModular({ ...base, anexos: ["A"], modelos: { A: "<h3>Anexo A — Meu SaaS</h3><p>Prazo {{vigencia_meses}} reajuste {{reajuste_indice}}</p>" } });
    expect(html).toContain("Meu SaaS");
    expect(html).toContain("Prazo 12 (doze) reajuste IGPM");
    expect(html).not.toContain("Licença de uso do sistema");
  });
  it("texto padrão para edição traz as variáveis no lugar dos valores", () => {
    expect(modeloPadraoContrato("geral")).toContain("{{vigencia_meses}}");
  });
});
