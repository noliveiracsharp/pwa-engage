import { describe, expect, it } from "vitest";
import { contextoFinanceiroAtual, empresaDaConsulta, type ContextoFinanceiro } from "./financeiro-contexto";

const gk: ContextoFinanceiro = { id: "gk", nome: "GK", documento: "", tipo: "administradora", empresa: { id: "gk" } };
const cond: ContextoFinanceiro = { id: "conectcon", nome: "ConectCon", documento: "", tipo: "condominio", empresa: { id: "conectcon" } };
describe("financeiro por entidade", () => {
  it("GK pode selecionar o financeiro ConectCon sem mudar sua empresa original", () => {
    expect(contextoFinanceiroAtual([gk, cond], "conectcon", "gk")?.id).toBe("conectcon");
    expect(empresaDaConsulta(true, false, "conectcon", "gk")).toBe("conectcon");
  });
  it("transferência retira o condomínio da seleção e retorna à GK", () => {
    expect(contextoFinanceiroAtual([gk], "conectcon", "gk")?.id).toBe("gk");
  });
  it("fora do financeiro continua consultando a empresa do usuário", () => {
    expect(empresaDaConsulta(false, false, "conectcon", "gk")).toBe("gk");
  });
  it("entidade ausente não pode produzir uma consulta sem filtro", () => {
    expect(empresaDaConsulta(true, true, "", "gk")).toBe("__sem_empresa__");
    expect(contextoFinanceiroAtual([], "conectcon", "gk")).toBeNull();
  });
});