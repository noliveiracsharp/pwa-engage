import { describe, expect, it } from "vitest";
import { titulosDaOferta } from "./financeiro";

const base = { id: "o1", numero: "#2026-1", parceiro_id: "c1", dt_orcamento: "2026-01-10", total_recorrente: 100, total_liquido: 0 };
const itens = [{ natureza: "recorrente", total: 100 }];
const mensais = (orc: Record<string, unknown>) =>
  titulosDaOferta(orc, itens).filter((t) => t.categoria === "Mensalidade de contrato");

describe("contrato sem prazo de término", () => {
  it("lança 12 mensalidades sem total na descrição, ignorando a vigência", () => {
    const t = mensais({ ...base, vigencia_meses: 36, prazo_indeterminado: true });
    expect(t).toHaveLength(12);
    expect(t[0]!.descricao).toBe("Oferta #2026-1 — Mensalidade 1");
  });
  it("com prazo, segue a vigência", () => {
    const t = mensais({ ...base, vigencia_meses: 24 });
    expect(t).toHaveLength(24);
    expect(t[0]!.descricao).toBe("Oferta #2026-1 — Mensalidade 1/24");
  });
});
