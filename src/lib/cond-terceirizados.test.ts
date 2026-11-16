import { describe, expect, it } from "vitest";
import { buscarColaborador, filtrarTerceirizados, formatarDocumento, liberacaoAcesso, type Colaborador, type Terceirizado } from "./cond-terceirizados";

const t = (nome: string, ativo = true, extra: Partial<Terceirizado> = {}): Terceirizado => ({ id: nome, nome, tipo_pessoa: "pj", documento: null, atividade: null, contato: null, telefone: null, email: null, observacoes: null, vinculo_id: nome, vinculo_ativo: ativo, obs_acesso: null, colaboradores: 0, ...extra });
const c = (nome: string, cpf: string): Colaborador => ({ id: nome, terceirizado_id: "x", nome, funcao: null, rg: null, cpf, celular: null, foto_url: null, ativo: true, observacoes: null });

describe("terceirizados", () => {
  it("separa ativos e inativos em ordem alfabética", () => {
    const l = [t("Okun"), t("Jardim Plus"), t("Antiga", false)];
    expect(filtrarTerceirizados(l, "", true).map((x) => x.nome)).toEqual(["Jardim Plus", "Okun"]);
    expect(filtrarTerceirizados(l, "", false).map((x) => x.nome)).toEqual(["Antiga"]);
  });
  it("busca por atividade sem acento", () => {
    expect(filtrarTerceirizados([t("A", true, { atividade: "Jardinagem" }), t("B")], "jardinagem", true)).toHaveLength(1);
  });
  it("portaria acha colaborador pelo CPF", () => {
    expect(buscarColaborador([c("Ana", "123.456.789-00"), c("Bia", "999")], "12345").map((x) => x.nome)).toEqual(["Ana"]);
  });
  it("empresa inativa bloqueia mesmo colaborador ativo", () => {
    expect(liberacaoAcesso(false, true).liberado).toBe(false);
    expect(liberacaoAcesso(true, false).liberado).toBe(false);
    expect(liberacaoAcesso(true, true).liberado).toBe(true);
  });
  it("formata CNPJ e CPF", () => {
    expect(formatarDocumento("12345678000199")).toBe("12.345.678/0001-99");
    expect(formatarDocumento("12345678900")).toBe("123.456.789-00");
  });
});
