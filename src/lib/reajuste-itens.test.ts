import { describe, expect, it } from "vitest";
import { reajustarOferta, vendaTravada } from "./reajuste-itens";

const linhas = [
  { id: "a", item_id: "inst", quantidade: 10, valor_unitario: 100, preco_custo: 50, imposto_pct: 10 },
  { id: "b", item_id: "cam", quantidade: 1, valor_unitario: 500, preco_custo: 300, imposto_pct: 10 },
];
const header = { desconto_tipo: "valor", desconto: 0, frete: 0, valores_adicionais: 0 };

describe("reajuste de ofertas", () => {
  it("oferta em Ativação preserva a venda e só atualiza custo/lucro", () => {
    const r = reajustarOferta(header, linhas, "inst", { preco_custo: 80, preco_venda: 150, imposto: 10 }, "custo_venda", true);
    expect(r.linhas[0]!.patch.valor_unitario).toBe(100);
    expect(r.linhas[0]!.patch.custo_total).toBe(800);
    expect(r.totais.total_liquido).toBe(1500);
    expect(r.totais.total_custo).toBe(1100);
  });

  it("oferta em andamento recalcula também o preço de venda", () => {
    const r = reajustarOferta(header, linhas, "inst", { preco_custo: 80, preco_venda: 150, imposto: 10 }, "custo_venda", false);
    expect(r.linhas[0]!.patch.total_linha).toBe(1500);
    expect(r.totais.total_liquido).toBe(2000);
  });

  it("Ativação e Aprovado travam a venda; Em andamento não", () => {
    expect(vendaTravada("Ativação")).toBe(true);
    expect(vendaTravada("Aprovado")).toBe(true);
    expect(vendaTravada("Em andamento")).toBe(false);
  });
});
