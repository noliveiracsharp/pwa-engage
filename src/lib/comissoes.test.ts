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

import { recebidoPorOferta as _rpo } from "./comissoes";
describe("recebidoPorOferta (Financeiro como fonte única)", () => {
  const tit = (n: number, status: string) => ({ tipo: "receber", origem_tipo: "oferta", origem_id: "o1", valor: 12000, status, parcela_n: n });
  it("2 de 5 parcelas baixadas = 24.000 recebidos", () => {
    const m = _rpo([tit(1, "pago"), tit(2, "pago"), tit(3, "aberto"), tit(4, "aberto"), tit(5, "aberto")]);
    expect(m.get("o1")).toBe(24000);
  });
  it("ignora marcação manual quando a oferta tem títulos", () => {
    const m = _rpo([tit(1, "aberto")], [{ orcamento_id: "o1", valor: 5000 }]);
    expect(m.get("o1")).toBe(0);
  });
  it("usa marcação manual quando não há títulos", () => {
    expect(_rpo([], [{ orcamento_id: "o2", valor: 5000 }]).get("o2")).toBe(5000);
  });
  it("ignora títulos a pagar e cancelados", () => {
    const m = _rpo([{ tipo: "pagar", origem_tipo: "oferta", origem_id: "o1", valor: 100, status: "pago" }, tit(1, "cancelado")]);
    expect(m.get("o1")).toBe(0);
  });
});
