import { describe, expect, it } from "vitest";
import { destinatariosAviso, mensagemResponsaveis, situacaoPlano } from "./cond-manutencoes";

describe("situacaoPlano", () => {
  it("data passada é vencido", () => expect(situacaoPlano("2026-11-14", "2026-11-15")).toBe("vencido"));
  it("até 15 dias é próximo", () => expect(situacaoPlano("2026-11-30", "2026-11-15")).toBe("proximo"));
  it("depois de 15 dias está no prazo", () => expect(situacaoPlano("2026-12-01", "2026-11-15")).toBe("no_prazo"));
});

describe("destinatariosAviso", () => {
  it("avisa só síndico, subsíndico e gerente vigentes, sem repetir celular", () => {
    const r = destinatariosAviso([
      { nome: "Ana", cargo: "sindico_morador", celular: "(11) 98888-7777" },
      { nome: "Bia", cargo: "gerente", celular: "11988887777" },
      { nome: "Caio", cargo: "zelador", celular: "11977776666" },
      { nome: "Dani", cargo: "subsindico", celular: "11966665555", fim: "2026-01-01" },
    ], "2026-11-15");
    expect(r).toEqual([{ nome: "Ana", celular: "11988887777" }]);
  });
});

describe("mensagemResponsaveis", () => {
  it("destaca não conformidade", () => {
    const t = mensagemResponsaveis({ condominio: "C", numero: "OS-1", tipo: "preventiva", titulo: "Gerador", quando: "x", total: 6, naoConformes: 2, link: "l" });
    expect(t).toContain("2 de 6 itens NÃO conformes");
  });
});
