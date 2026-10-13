import { describe, expect, it } from "vitest";
import { comissaoDisponivel, comissaoLiberada } from "./comissoes";

describe("comissaoLiberada", () => {
  it("10.000 em 10x de 1.000, comissão 1.500: 1ª parcela paga libera 150", () => {
    expect(comissaoLiberada({ comissao: 1500, totalOferta: 10000, recebido: 1000, regra: "recebimento" })).toBe(150);
  });
  it("nada recebido não libera nada", () => {
    expect(comissaoLiberada({ comissao: 1500, totalOferta: 10000, recebido: 0, regra: "recebimento" })).toBe(0);
  });
  it("entrada de 20% libera 300 no fechamento e 120 por parcela", () => {
    expect(comissaoLiberada({ comissao: 1500, totalOferta: 10000, recebido: 0, regra: "recebimento", entradaPct: 20 })).toBe(300);
    expect(comissaoLiberada({ comissao: 1500, totalOferta: 10000, recebido: 1000, regra: "recebimento", entradaPct: 20 })).toBe(420);
  });
  it("tudo recebido libera a comissão inteira, sem passar dela", () => {
    expect(comissaoLiberada({ comissao: 1500, totalOferta: 10000, recebido: 12000, regra: "recebimento" })).toBe(1500);
  });
  it("regra fechamento libera tudo", () => {
    expect(comissaoLiberada({ comissao: 1500, totalOferta: 10000, recebido: 0, regra: "fechamento" })).toBe(1500);
  });
  it("disponível desconta o que já foi pago", () => {
    expect(comissaoDisponivel(300, 150)).toBe(150);
    expect(comissaoDisponivel(100, 150)).toBe(0);
  });
});
