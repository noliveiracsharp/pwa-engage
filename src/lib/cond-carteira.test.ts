import { describe, expect, it } from "vitest";
import { condominioInicial, resumoCarteira } from "./cond-carteira";

describe("carteira de condomínios", () => {
  const conds = [
    { id: "c1", administradora_id: "a1", facilities_id: "f1" },
    { id: "c2", administradora_id: "a1", facilities_id: "f2" },
    { id: "c3", administradora_id: "a2", tipo_gestao: "autogestao" },
  ];
  it("conta administradoras e seus condomínios, ignorando autogestão", () => {
    const r = resumoCarteira(conds, []);
    expect(r.administradoras.empresas).toBe(1);
    expect(r.administradoras.ranking[0]).toEqual({ empresaId: "a1", condominios: ["c1", "c2"] });
    expect(r.autogestao).toBe(1);
  });
  it("conta facilities", () => {
    expect(resumoCarteira(conds, []).facilities).toMatchObject({ empresas: 2, condominios: 2 });
  });
  it("conta sindicaturas profissionais e síndicos moradores", () => {
    const r = resumoCarteira(conds, [
      { condominio_id: "c1", modalidade: "profissional", empresa_id: "s1" },
      { condominio_id: "c2", modalidade: "morador" },
    ]);
    expect(r.sindicatura).toMatchObject({ empresas: 1, condominios: 1 });
    expect(r.sindicoMorador).toBe(1);
  });
  it("condomínio padrão só vale se ainda disponível", () => {
    expect(condominioInicial("c2", ["c1", "c2"])).toBe("c2");
    expect(condominioInicial("x", ["c1", "c2"])).toBe("");
    expect(condominioInicial(null, ["c1"])).toBe("c1");
  });
});
