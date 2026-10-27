import { describe, expect, it } from "vitest";
import { ofertaExigeAprovacao, ofertaLiberada, situacaoOferta, type ConfigAprovacaoOferta } from "./aprovacao-ofertas";

const cfg: ConfigAprovacaoOferta = { ativo: true, aprovadorPrincipalId: "g1", aprovadoresAdicionais: ["g2"], regra: "principal", valorMinimo: 0, margemMinima: 0, descontoMaximo: 0 };
const d = { valor: 1000, margemPct: 30, descontoPct: 0, montadaPor: "v1" };

describe("aprovação de ofertas", () => {
  it("oferta de vendedor precisa de aprovação", () => {
    expect(situacaoOferta(cfg, d, [])).toBe("pendente");
  });
  it("oferta montada por gestor aprova direto", () => {
    expect(situacaoOferta(cfg, { ...d, montadaPor: "g2" }, [])).toBe("dispensada");
  });
  it("workflow desligado não exige aprovação", () => {
    expect(ofertaExigeAprovacao({ ...cfg, ativo: false }, d)).toBe(false);
  });
  it("margem abaixo do mínimo exige aprovação; acima não", () => {
    const c = { ...cfg, margemMinima: 20 };
    expect(ofertaExigeAprovacao(c, { ...d, margemPct: 15 })).toBe(true);
    expect(ofertaExigeAprovacao(c, { ...d, margemPct: 25 })).toBe(false);
  });
  it("aprovação do principal libera; rejeição bloqueia", () => {
    expect(situacaoOferta(cfg, d, [{ usuarioId: "g1", status: "aprovado" }])).toBe("aprovada");
    expect(situacaoOferta(cfg, d, [{ usuarioId: "g1", status: "rejeitado", justificativa: "x" }])).toBe("rejeitada");
    expect(ofertaLiberada("pendente")).toBe(false);
    expect(ofertaLiberada("aprovada")).toBe(true);
  });
});
