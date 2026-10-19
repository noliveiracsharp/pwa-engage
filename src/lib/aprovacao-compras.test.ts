import { describe, expect, it } from "vitest";
import { situacaoAprovacao, podeGerarPedido, type ConfigAprovacao } from "./aprovacao-compras";

const base: ConfigAprovacao = { ativo: true, aprovadorPrincipalId: "P", aprovadoresAdicionais: ["A", "B"], regra: "principal", valorMinimo: 0 };

describe("workflow de aprovação de compras", () => {
  it("sem aprovação ativa, gera pedido direto", () => {
    expect(podeGerarPedido(situacaoAprovacao({ ...base, ativo: false }, 1000, []))).toBe(true);
  });
  it("principal sempre precisa aprovar", () => {
    expect(situacaoAprovacao({ ...base, regra: "todos" }, 10, [{ usuarioId: "A", status: "aprovado" }, { usuarioId: "B", status: "aprovado" }])).toBe("pendente");
  });
  it("principal + 1 adicional", () => {
    const cfg = { ...base, regra: "principal_mais_um" as const };
    expect(situacaoAprovacao(cfg, 10, [{ usuarioId: "P", status: "aprovado" }])).toBe("pendente");
    expect(situacaoAprovacao(cfg, 10, [{ usuarioId: "P", status: "aprovado" }, { usuarioId: "B", status: "aprovado" }])).toBe("aprovada");
  });
  it("uma rejeição bloqueia", () => {
    expect(situacaoAprovacao(base, 10, [{ usuarioId: "P", status: "rejeitado" }])).toBe("rejeitada");
  });
  it("abaixo do valor mínimo dispensa aprovação", () => {
    expect(situacaoAprovacao({ ...base, valorMinimo: 500 }, 499.99, [])).toBe("dispensada");
  });
});
