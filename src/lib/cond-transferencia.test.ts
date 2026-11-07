import { describe, expect, it } from "vitest";
import { confirmacaoValida, ocupacaoPorPapeis, unidadeVazia } from "./cond-transferencia";

const zero = { pessoas: 0, veiculos: 0, pets: 0, contatos: 0, documentos: 0, vagas: 0, agendamentos: 0 };

describe("cond-transferencia", () => {
  it("unidade sem nada é vazia", () => expect(unidadeVazia(zero)).toBe(true));
  it("agendamento ativo impede exclusão direta", () => expect(unidadeVazia({ ...zero, agendamentos: 1 })).toBe(false));
  it("pessoa vinculada impede exclusão direta", () => expect(unidadeVazia({ ...zero, pessoas: 2 })).toBe(false));
  it("inquilino torna alugada", () => expect(ocupacaoPorPapeis(["proprietario", "inquilino"])).toBe("alugada"));
  it("só proprietário torna própria", () => expect(ocupacaoPorPapeis(["proprietario", "familiar"])).toBe("propria"));
  it("sem titular fica vazia", () => expect(ocupacaoPorPapeis(["familiar"])).toBe("vazia"));
  it("confirmação exige o número", () => {
    expect(confirmacaoValida("101", "101")).toBe(true);
    expect(confirmacaoValida("102", "101")).toBe(false);
  });
});
