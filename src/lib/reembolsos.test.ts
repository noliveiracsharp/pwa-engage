import { describe, expect, it } from "vitest";
import { disponivelCartao, resumoDespesas, usoCartaoMes } from "./reembolsos";

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
