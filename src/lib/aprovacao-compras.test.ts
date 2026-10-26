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
  it("limite mensal de 100: duas compras de 50 passam, a próxima de 49,99 exige aprovação", () => {
    const cfg = { ...base, valorMinimo: 0, limiteMensal: 100 };
    expect(situacaoAprovacao(cfg, 50, [], 0)).toBe("dispensada");
    expect(situacaoAprovacao(cfg, 50, [], 50)).toBe("dispensada");
    expect(situacaoAprovacao(cfg, 49.99, [], 100)).toBe("pendente");
  });
  it("faixas: até 5.000 só o principal; acima precisa de 2 aprovações", () => {
    const cfg = { ...base, faixas: [{ ate: 5000, aprovacoes: 1 }, { ate: null, aprovacoes: 2 }] };
    const p = [{ usuarioId: "P", status: "aprovado" as const }];
    expect(situacaoAprovacao(cfg, 5000, p)).toBe("aprovada");
    expect(situacaoAprovacao(cfg, 5000.01, p)).toBe("pendente");
    expect(situacaoAprovacao(cfg, 6000, [...p, { usuarioId: "A", status: "aprovado" }])).toBe("aprovada");
  });
});
