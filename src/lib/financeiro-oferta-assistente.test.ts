import { describe, expect, it } from "vitest";
import { titulosDaOferta } from "./financeiro";

const orc = { id: "o", numero: "#1", parceiro_id: "c", total_liquido: 1000, total_custo: 0, dt_orcamento: "2026-11-02",
  parcelas: [{ numero: 1, vencimento: "2026-11-10", valor: 1000 }] };
const itens = [
  { id: "p", natureza: "produto", total_linha: 400, custo_total: 300 },
  { id: "s", natureza: "servico", total_linha: 600, custo_total: 200, execucao: "terceiro", fornecedor_id: "f" },
];

describe("assistente financeiro da Oferta", () => {
  it("padrão: um título a receber por parcela", () => {
    expect(titulosDaOferta(orc, itens).filter((t) => t.tipo === "receber")).toHaveLength(1);
  });
  it("boletos separados: produto 400 e serviço 600", () => {
    const r = titulosDaOferta(orc, itens, { separarProdutoServico: true }).filter((t) => t.tipo === "receber");
    expect(r.map((t) => [t.categoria, t.valor])).toEqual([["Venda de produtos", 400], ["Serviço avulso", 600]]);
  });
  it("produtos no cartão em 3x entram na fatura do cartão", () => {
    const p = titulosDaOferta(orc, itens, { produtos: { modo: "cartao", cartaoId: "k", parcelas: 3, dataCompra: "2026-11-02", diaFechamento: 25, diaVencimento: 5 } })
      .filter((t) => t.cartao_id === "k");
    expect(p.map((t) => t.valor)).toEqual([100, 100, 100]);
    expect(p[0]!.vencimento).toBe("2026-12-05");
  });
  it("pedido de compra: não lança custo de produto", () => {
    expect(titulosDaOferta(orc, itens, { produtos: { modo: "pedido" } }).some((t) => t.categoria === "Fornecedores")).toBe(false);
  });
  it("fornecedor do serviço avulso em 2x", () => {
    const t = titulosDaOferta(orc, itens, { terceiros: { f: { parcelas: 2, primeiro: "2026-12-01" } } }).filter((x) => x.categoria === "Serviços de terceiros");
    expect(t.map((x) => [x.vencimento, x.valor])).toEqual([["2026-12-01", 100], ["2027-01-01", 100]]);
  });
});
