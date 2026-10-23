import { describe, expect, it } from "vitest";
import { alvosOferta } from "./financeiro-recorrencia";
import { titulosDaOferta } from "./financeiro";

const t = (id: string, n: number, extra = {}) => ({ id, origem_tipo: "oferta", origem_id: "o1", tipo: "receber", empresa_id: "e",
  descricao: `Oferta #1 — Implantação (${n}/3)`, status: "aberto", vencimento: `2026-1${n - 1}-10`, ...extra });

describe("série gerada por Oferta", () => {
  it("edição em 'todos' alcança as parcelas irmãs da mesma oferta", () => {
    const outra = { ...t("x", 1), descricao: "Oferta #1 — Mensalidade (1/12)" };
    const r = alvosOferta(t("a", 1), [t("a", 1), t("b", 2), t("c", 3), outra], "todos", "2026-01-01");
    expect(r.map((x) => x["id"]).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("contas a pagar da Oferta", () => {
  it("usa o custo dos itens quando o cabeçalho está zerado", () => {
    const out = titulosDaOferta({ id: "o", numero: "#1", total_custo: 0, total_liquido: 1000 }, [{ custo_total: 400 }, { preco_custo: 50, quantidade: 2 }]);
    const pagar = out.filter((x) => x.tipo === "pagar");
    expect(pagar.reduce((s, x) => s + x.valor, 0)).toBe(500);
  });
});
