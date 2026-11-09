import { describe, expect, it } from "vitest";
import { condServicoVazia, condicoesDoCronograma, cronogramaServicos, cronogramaTerceiro, servicoSeparado, terceirosAvulsos } from "./oferta-cronogramas";

describe("cronogramas da Oferta", () => {
  it("serviço avulso com início de cobrança sai do parcelamento geral", () => {
    expect(servicoSeparado({ natureza: "servico", dt_inicio_faturamento: "2026-12-25" })).toBe(true);
    expect(servicoSeparado({ natureza: "servico", dt_inicio_faturamento: "" })).toBe(false);
    expect(servicoSeparado({ natureza: "produto", dt_inicio_faturamento: "2026-12-25" })).toBe(false);
  });
  it("recebimento do serviço separado em N parcelas a partir do início", () => {
    const r = cronogramaServicos([{ linha: "a", descricao: "Instalação", pagador: "", valor: 900, inicio: "2026-12-25", parcelas: 3 }]);
    expect(r.map((p) => p.valor)).toEqual([300, 300, 300]);
    expect(r[2]!.vencimento).toBe("2027-02-25");
  });
  it("serviço avulso aceita entrada própria e guarda a condição para recarregar", () => {
    const cond = { forma: "Pix", entrada_tipo: "valor" as const, entrada: "500", fixas: {}, datas: { 3: "2027-03-10" } };
    const r = cronogramaServicos([{ linha: "a", sid: "i1#1", descricao: "Instalação", pagador: "", valor: 900, inicio: "2026-12-25", parcelas: 3, cond }]);
    expect(r.map((p) => p.valor)).toEqual([500, 200, 200]);
    expect(r[2]!.vencimento).toBe("2027-03-10");
    const back = condicoesDoCronograma(r)["i1#1"]!;
    expect(back.forma).toBe("Pix");
    expect(back.entrada).toBe("500");
    expect(back.datas).toEqual({ 3: "2027-03-10" });
  });
  it("fornecedor terceirizado paga a partir do início do serviço quando não há data", () => {
    const t = terceirosAvulsos([
      { natureza: "servico", execucao: "terceiro", fornecedor_id: "f1", custo: 6400, dt_inicio_faturamento: "2026-12-25" },
      { natureza: "recorrente", execucao: "terceiro", fornecedor_id: "f1", custo: 100, dt_inicio_faturamento: "" },
    ]);
    expect(t).toEqual([{ fornecedor: "f1", custo: 6400, inicio: "2026-12-25" }]);
    const ps = cronogramaTerceiro(6400, { parcelas: "2", primeira: "" }, "2026-12-25", "2026-11-01");
    expect(ps.map((p) => [p.vencimento, p.valor])).toEqual([["2026-12-25", 3200], ["2027-01-25", 3200]]);
  });
});

describe("modos do serviço avulso", () => {
  it("com juros aplica tabela Price e comodato cobra só a taxa", () => {
    const base = { linha: "a", sid: "s#1", descricao: "X", pagador: "", valor: 1000, inicio: "2026-12-10", parcelas: 2 };
    const j = cronogramaServicos([{ ...base, cond: { ...condServicoVazia(), modo: "com_juros", juros: "10" } }]);
    expect(j.map((p) => p.valor)).toEqual([576.19, 576.19]);
    const c = cronogramaServicos([{ ...base, cond: { ...condServicoVazia(), modo: "comodato", taxa_instalacao: "300" } }]);
    expect(c.reduce((s, p) => s + p.valor, 0)).toBe(300);
  });
});

describe("produtos de ambiente com pagamento próprio", () => {
  it("guarda parcelas e 1º vencimento do bloco de produtos para recarregar", () => {
    const cond = { forma: "Boleto", entrada_tipo: "percentual" as const, entrada: "", fixas: {}, datas: {}, parcelas: "4", inicio: "2026-12-10" };
    const r = cronogramaServicos([{ linha: "prod:Ambiente 2", sid: "prod:Ambiente 2", descricao: "Produtos", pagador: "", valor: 1000, inicio: cond.inicio, parcelas: 4, cond }]);
    expect(r.map((p) => p.valor)).toEqual([250, 250, 250, 250]);
    const back = condicoesDoCronograma(r)["prod:Ambiente 2"]!;
    expect(back.parcelas).toBe("4");
    expect(back.inicio).toBe("2026-12-10");
  });
});
