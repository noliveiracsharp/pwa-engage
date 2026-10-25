import { describe, expect, it } from "vitest";
import { classificarItem } from "./itens-classificacao";

const centros = [{ id: "c21", codigo: "2.1" }, { id: "c12", codigo: "1.2" }];
const contas = [{ id: "p103", codigo: "1.1.03" }, { id: "p101", codigo: "1.1.01" }];

describe("classificarItem", () => {
  it("produto CFTV recebe centro 2.1, conta 1.1.03, CFOP 5102 e CSOSN 102", () => {
    expect(classificarItem({ tipo: "Produto", categoria: "Segurança Eletrônica & CFTV" }, centros, contas)).toEqual({
      centro_custo_id: "c21", plano_contas_id: "p103", cfop_padrao: "5102", csosn_cst: "102", origem: "0",
    });
  });
  it("serviço recorrente não recebe CFOP/CSOSN", () => {
    expect(classificarItem({ tipo: "Serviço", categoria: "Serviços Recorrentes (Mensais)" }, centros, contas)).toEqual({
      centro_custo_id: "c12", plano_contas_id: "p101",
    });
  });
  it("não sobrescreve campos já preenchidos, a menos que pedido", () => {
    const item = { tipo: "Produto", categoria: "Redes & Telecom", cfop_padrao: "5405", centro_custo_id: "x" };
    expect(classificarItem(item, centros, contas)["cfop_padrao"]).toBeUndefined();
    expect(classificarItem(item, centros, contas, true)["cfop_padrao"]).toBe("5102");
    expect(classificarItem(item, centros, contas, true)["centro_custo_id"]).toBe("c21");
  });
});
