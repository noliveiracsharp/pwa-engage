import { describe, expect, it } from "vitest";
import { titulosDaOferta } from "./financeiro";

const oferta = {
  id: "o1", numero: "#2026-1", parceiro_id: "condominio",
  total_recorrente: 4000, vigencia_meses: 2, dt_orcamento: "2026-10-01",
  parcelas: [{ numero: 1, vencimento: "2026-10-10", valor: 1000 }],
};

describe("faturamento misto", () => {
  it("mensalidade é dividida por pagador e guarda o cliente atendido", () => {
    const t = titulosDaOferta(oferta, [
      { natureza: "recorrente", total_linha: 2500, faturar_para_id: "administradora" },
      { natureza: "recorrente", total_linha: 1500 },
      { natureza: "produto", total_linha: 1000 },
    ]).filter((x) => x.categoria === "Mensalidade de contrato");
    expect(t).toHaveLength(4);
    const adm = t.filter((x) => x.parceiro_id === "administradora");
    expect(adm.map((x) => x.valor)).toEqual([2500, 2500]);
    expect(adm[0]!.cliente_atendido_id).toBe("condominio");
    const cond = t.filter((x) => x.parceiro_id === "condominio");
    expect(cond.map((x) => x.valor)).toEqual([1500, 1500]);
    expect(cond[0]!.cliente_atendido_id).toBeUndefined();
  });

  it("implantação rateada fecha o centavo no cliente", () => {
    const t = titulosDaOferta({ ...oferta, total_recorrente: 0 }, [
      { natureza: "produto", total_linha: 1, faturar_para_id: "facilities" },
      { natureza: "servico", total_linha: 2 },
    ]);
    const soma = t.filter((x) => x.tipo === "receber").reduce((s, x) => s + x.valor, 0);
    expect(Math.round(soma * 100) / 100).toBe(1000);
    expect(t.find((x) => x.parceiro_id === "facilities")!.valor).toBe(333.33);
  });

  it("sem pagador diferente, mantém um título por parcela", () => {
    const t = titulosDaOferta(oferta, [{ natureza: "recorrente", total_linha: 4000 }]);
    expect(t.filter((x) => x.tipo === "receber")).toHaveLength(3);
  });
});
