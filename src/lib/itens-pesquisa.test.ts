import { describe, expect, it } from "vitest";
import { FILTROS_ITENS, parametrosItens } from "./itens-pesquisa";

describe("Parâmetros da pesquisa de produtos e serviços", () => {
  it("carrega somente 50 itens na primeira página", () => {
    expect(parametrosItens(FILTROS_ITENS)).toMatchObject({ p_limite: 50, p_offset: 0 });
  });
  it("segunda página não repete a primeira", () => {
    expect(parametrosItens(FILTROS_ITENS, 2, 50).p_offset).toBe(50);
  });
  it("envia classificação mensal e natureza ao banco", () => {
    expect(parametrosItens({ busca: " LGPD ", tipos: ["Serviço"], categoria: "Serviços Recorrentes (Mensais)", status: "ativo" })).toMatchObject({
      p_busca: "LGPD", p_tipos: ["Serviço"], p_categoria: "Serviços Recorrentes (Mensais)", p_status: "ativo",
    });
  });
});