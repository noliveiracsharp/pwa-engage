import { describe, expect, it } from "vitest";
import { sugerirConciliacao } from "./conciliacao";

const mov = (o: Partial<{ data: string; operacao: "C" | "D"; valor: number; titulo: string }>) =>
  ({ data: "2026-10-10", operacao: "C" as const, valor: 100, descricao: "", titulo: "", ...o });

describe("conciliação bancária", () => {
  it("entrada casa com receber de mesmo valor", () => {
    const r = sugerirConciliacao([mov({})], [
      { id: "p", tipo: "pagar", valor: 100, vencimento: "2026-10-10" },
      { id: "r", tipo: "receber", valor: 100, vencimento: "2026-10-08" },
    ]);
    expect(r).toEqual([{ mov: 0, tituloId: "r", confianca: "alta", dias: 2 }]);
  });
  it("não casa fora de 10 dias ou com valor diferente", () => {
    expect(sugerirConciliacao([mov({})], [
      { id: "a", tipo: "receber", valor: 100, vencimento: "2026-10-25" },
      { id: "b", tipo: "receber", valor: 100.5, vencimento: "2026-10-10" },
    ])).toEqual([]);
  });
  it("usa o saldo de título parcial", () => {
    expect(sugerirConciliacao([mov({ valor: 70 })], [{ id: "a", tipo: "receber", valor: 100, valor_pago: 30, vencimento: "2026-10-10" }])).toHaveLength(1);
  });
  it("nome no extrato desempata e cada título só é usado uma vez", () => {
    const t = [
      { id: "x", tipo: "receber", valor: 100, vencimento: "2026-10-10", nome: "Condomínio Alfa" },
      { id: "y", tipo: "receber", valor: 100, vencimento: "2026-10-10", nome: "Condomínio Beta" },
    ];
    const r = sugerirConciliacao([mov({ titulo: "PIX RECEBIDO BETA" }), mov({})], t);
    expect(r.map((p) => p.tituloId)).toEqual(["y", "x"]);
    expect(r[0]!.confianca).toBe("alta");
  });
});
