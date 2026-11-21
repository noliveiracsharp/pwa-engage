import { describe, expect, it } from "vitest";
import { acaoParaCnpj, acoesPermitidas } from "./cond-transf-gestao";

describe("transferência de condomínio", () => {
  it("CNPJ de outra administradora oferece solicitar", () =>
    expect(acaoParaCnpj({ situacao: "outra", condominio_id: "c", nome: "X", administradora: "Alfa", pendente: false })).toBe("solicitar"));
  it("com pedido pendente, só aguarda", () =>
    expect(acaoParaCnpj({ situacao: "outra", condominio_id: "c", nome: "X", administradora: "Alfa", pendente: true })).toBe("aguardar"));
  it("CNPJ livre segue para cadastro", () => expect(acaoParaCnpj({ situacao: "livre" })).toBe("cadastrar"));
  it("administradora atual aprova ou recusa", () =>
    expect(acoesPermitidas({ status: "pendente", empresa_origem_id: "alfa", empresa_destino_id: "gk" }, "alfa")).toEqual(["aprovar", "recusar"]));
  it("quem pediu só cancela", () =>
    expect(acoesPermitidas({ status: "pendente", empresa_origem_id: "alfa", empresa_destino_id: "gk" }, "gk")).toEqual(["cancelar"]));
  it("respondida não aceita ações", () =>
    expect(acoesPermitidas({ status: "aprovada", empresa_origem_id: "alfa", empresa_destino_id: "gk" }, "alfa")).toEqual([]));
});
