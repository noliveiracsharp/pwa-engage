import { describe, expect, it } from "vitest";
import { diasPagamento, disponivelCartao, proximaDataPagamento, resumoDespesas, usoCartaoMes } from "./reembolsos";

const L = [
  { modalidade: "cartao", cartao_id: "c1", data: "2026-10-03", valor: 100, status: "aprovado" },
  { modalidade: "cartao", cartao_id: "c1", data: "2026-10-20", valor: 50, status: "pendente" },
  { modalidade: "cartao", cartao_id: "c1", data: "2026-10-21", valor: 999, status: "reprovado" },
  { modalidade: "cartao", cartao_id: "c1", data: "2026-09-30", valor: 70, status: "aprovado" },
  { modalidade: "reembolso", data: "2026-10-05", valor: 40, status: "pendente" },
];

describe("reembolsos", () => {
  it("uso do cartão soma só o mês e ignora reprovadas", () => {
    expect(usoCartaoMes(L, "c1", "2026-10")).toBe(150);
  });
  it("disponível nunca fica negativo", () => {
    expect(disponivelCartao(1000, 150)).toBe(850);
    expect(disponivelCartao(100, 150)).toBe(0);
  });
  it("a reembolsar conta só reembolsos não reprovados e sem título gerado", () => {
    expect(resumoDespesas(L).reembolsar).toBe(40);
  });
});

describe("política de pagamento de reembolso", () => {
  it("lê dias da empresa", () => expect(diasPagamento("25, 10,10 x 40")).toEqual([10, 25]));
  it("vai para o próximo dia de pagamento do mês", () => expect(proximaDataPagamento("2026-11-03", [10, 25])).toBe("2026-11-10"));
  it("passa para o mês seguinte após o último dia", () => expect(proximaDataPagamento("2026-10-30", [10, 25])).toBe("2026-11-10"));
  it("respeita o prazo de corte", () => expect(proximaDataPagamento("2026-11-08", [10, 25], 3)).toBe("2026-11-25"));
  it("fim de semana vai para segunda", () => expect(proximaDataPagamento("2026-11-01", [7])).toBe("2026-11-09"));
  it("sem política paga na própria data", () => expect(proximaDataPagamento("2026-10-30", [])).toBe("2026-10-30"));
});
