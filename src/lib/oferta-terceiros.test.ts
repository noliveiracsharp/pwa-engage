import { describe, expect, it } from "vitest";
import { titulosDaOferta } from "@/lib/financeiro";
import { precoPorMarkup } from "@/lib/orcamentos";

describe("serviços terceirizados", () => {
  it("mark-up divisor: custo 1000, imposto 10%, margem 20% = 1428,57", () => {
    expect(precoPorMarkup(1000, 20, 10)).toBe(1428.57);
  });
  it("gera contas a pagar ao fornecedor (avulso uma vez, recorrente todo mês)", () => {
    const orc = { id: "o1", numero: "#1", parceiro_id: "c1", total_liquido: 3000, total_recorrente: 500, vigencia_meses: 3,
      parcelas: [{ numero: 1, vencimento: "2026-11-10", valor: 3000 }], total_custo: 1300 };
    const itens = [
      { natureza: "servico", execucao: "terceiro", fornecedor_id: "f1", custo_total: 1000, total_linha: 1428.57 },
      { natureza: "recorrente", execucao: "terceiro", fornecedor_id: "f2", custo_total: 200, total_linha: 500 },
      { natureza: "produto", custo_total: 100, total_linha: 1571.43 },
    ];
    const t = titulosDaOferta(orc, itens).filter((x) => x.tipo === "pagar");
    expect(t.filter((x) => x.parceiro_id === "f1").map((x) => x.valor)).toEqual([1000]);
    expect(t.filter((x) => x.parceiro_id === "f2").map((x) => x.valor)).toEqual([200, 200, 200]);
    const generico = t.filter((x) => x.parceiro_id === null).reduce((s, x) => s + x.valor, 0);
    expect(Math.round(generico * 100) / 100).toBe(100);
  });
});
