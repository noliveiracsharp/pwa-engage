import { describe, expect, it } from "vitest";
import { caixaPorMes, resumoTitulos, situacaoTitulo, titulosDaOferta, titulosDoPedido, valorBaixa, parcelasManuais } from "./financeiro";

describe("financeiro", () => {
  it("aberto vencido antes de hoje fica atrasado", () => {
    expect(situacaoTitulo({ status: "aberto", vencimento: "2026-01-10" }, "2026-01-11")).toBe("atrasado");
    expect(situacaoTitulo({ status: "aberto", vencimento: "2026-01-11" }, "2026-01-11")).toBe("aberto");
    expect(situacaoTitulo({ status: "pago", vencimento: "2020-01-01" }, "2026-01-11")).toBe("pago");
  });

  it("baixa soma juros e desconta desconto", () => {
    expect(valorBaixa(1000, 20, 50)).toBe(970);
  });

  it("oferta gera uma conta a receber por parcela e despesas a pagar", () => {
    const t = titulosDaOferta({
      id: "o1", numero: "#2026-1", parceiro_id: "c1",
      parcelas: [{ numero: 1, vencimento: "2026-02-10", valor: 4000 }, { numero: 2, vencimento: "2026-03-10", valor: 6000 }],
      despesas_operacionais: [{ key: "a", categoria: "transporte", descricao: "", valor: "300" }],
    });
    expect(t.filter((x) => x.tipo === "receber").map((x) => x.valor)).toEqual([4000, 6000]);
    const desp = t.find((x) => x.tipo === "pagar");
    expect(desp?.valor).toBe(300);
    expect(desp?.vencimento).toBe("2026-02-10");
  });

  it("pedido segue o cronograma do fornecedor proporcional ao total", () => {
    const t = titulosDoPedido({
      pedidoId: "p1", numero: "PC-2026-001", fornecedorId: "f1", total: 1000,
      cronograma: [{ numero: 1, vencimento: "2026-02-10", valor: 400 }, { numero: 2, vencimento: "2026-03-10", valor: 600 }, { numero: 3, vencimento: "2026-04-10", valor: 1000 }],
    });
    expect(t.map((x) => x.valor)).toEqual([200, 300, 500]);
    expect(t.reduce((s, x) => s + x.valor, 0)).toBe(1000);
  });

  it("pedido sem cronograma vira uma conta única para hoje", () => {
    const t = titulosDoPedido({ pedidoId: "p", numero: "PC", fornecedorId: "f", total: 99.9, cronograma: [], hoje: "2026-05-01" });
    expect(t).toHaveLength(1);
    expect(t[0]?.vencimento).toBe("2026-05-01");
  });

  it("resumo e caixa separam realizado de previsto", () => {
    const tit = [
      { tipo: "receber", status: "pago", valor: 100, valor_pago: 110, pago_em: "2026-05-03", vencimento: "2026-05-01" },
      { tipo: "receber", status: "aberto", valor: 200, vencimento: "2026-04-01" },
      { tipo: "pagar", status: "aberto", valor: 50, vencimento: "2026-06-01" },
      { tipo: "pagar", status: "cancelado", valor: 999, vencimento: "2026-06-01" },
    ];
    expect(resumoTitulos(tit, "2026-05-10")).toEqual({ aVencer: 50, vencidos: 200, pagoMes: 110, emAberto: 250 });
    const c = caixaPorMes(tit);
    expect(c.find((x) => x.mes === "2026-05")?.entradas).toBe(110);
    expect(c.find((x) => x.mes === "2026-06")?.saidasPrev).toBe(50);
  });
});

describe("financeiro — fornecedor e manual", () => {
  it("oferta gera contas a pagar do fornecedor espelhando o cliente", () => {
    const t = titulosDaOferta({
      id: "o1", numero: "#1", total_custo: 1000, compra_condicao: { modo: "espelhar" },
      parcelas: [{ numero: 1, vencimento: "2026-02-10", valor: 4000 }, { numero: 2, vencimento: "2026-03-10", valor: 6000 }],
    });
    const f = t.filter((x) => x.tipo === "pagar" && x.categoria === "Fornecedores");
    expect(f.map((x) => [x.vencimento, x.valor])).toEqual([["2026-02-10", 400], ["2026-03-10", 600]]);
  });
  it("parcelado divide o total; recorrente repete o mensal", () => {
    const p = parcelasManuais({ modo: "parcelado", valor: 100, quantidade: 3, primeira: "2026-01-10" });
    expect(p.map((x) => x.valor)).toEqual([33.33, 33.33, 33.34]);
    const r = parcelasManuais({ modo: "recorrente", valor: 350, quantidade: 12, primeira: "2026-01-10" });
    expect(r).toHaveLength(12);
    expect(r[11]).toEqual({ vencimento: "2026-12-10", valor: 350 });
  });
});
