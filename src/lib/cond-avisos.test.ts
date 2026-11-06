import { describe, expect, it } from "vitest";
import { papelNoPublico, planejarEnvios, preencherAviso, validarAviso, type Destinatario } from "./cond-avisos";

const d = (o: Partial<Destinatario>): Destinatario => ({ condominio_id: "c1", cond_unidade_id: "u1", unidade: "101", bloco: "Torre 1", usuario_id: "p1", nome: "Ana Lima", email: "ana@x.com", celular: "(11) 99999-0000", papel: "proprietario", ...o });

describe("avisos do condomínio", () => {
  it("proprietários não inclui inquilino", () => {
    expect(papelNoPublico("inquilino", "proprietarios")).toBe(false);
    expect(papelNoPublico("proprietario", "proprietarios")).toBe(true);
  });
  it("titulares exclui família; todos inclui família", () => {
    expect(papelNoPublico("familiar", "titulares")).toBe(false);
    expect(papelNoPublico("familiar", "todos")).toBe(true);
  });
  it("prestador nunca recebe aviso", () => {
    expect(papelNoPublico("prestador", "todos")).toBe(false);
  });
  it("pessoa com duas unidades no mesmo condomínio recebe uma mensagem por canal", () => {
    const r = planejarEnvios([d({}), d({ cond_unidade_id: "u2", unidade: "102" })], "todos", ["whatsapp", "email"]);
    expect(r.envios).toHaveLength(2);
    expect(r.envios[0]!.unidades).toBe("Torre 1 · 101, Torre 1 · 102");
  });
  it("mesma pessoa em condomínios diferentes recebe em cada um", () => {
    const r = planejarEnvios([d({}), d({ condominio_id: "c2" })], "todos", ["email"]);
    expect(r.envios).toHaveLength(2);
  });
  it("conta quem não tem contato no canal escolhido", () => {
    const r = planejarEnvios([d({ celular: null })], "todos", ["whatsapp"]);
    expect(r.envios).toHaveLength(0);
    expect(r.semContato).toBe(1);
  });
  it("preenche variáveis com o primeiro nome", () => {
    expect(preencherAviso("Olá {{nome}}, unidade {{unidade}} do {{condominio}}", { nome: "Ana Lima", unidade: "101", condominio: "Solar" })).toBe("Olá Ana, unidade 101 do Solar");
  });
  it("exige ao menos um canal", () => {
    expect(validarAviso({ titulo: "a", mensagemTexto: "b", canais: [], condominios: ["c1"] })).toMatch(/canal/);
  });
});
