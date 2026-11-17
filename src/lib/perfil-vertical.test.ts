import { describe, expect, it } from "vitest";
import { perfisDaEmpresa, verticalDaRota, verticalDoPerfil } from "./perfil-vertical";

describe("perfil-vertical", () => {
  it("perfis padrão do sistema (sem empresa) aparecem para a empresa ativa", () => {
    const r = perfisDaEmpresa([{ id: 1, descricao: "Administrador", empresa_id: null, ordem: 1 }], "emp-a");
    expect(r).toHaveLength(1);
  });
  it("perfis personalizados de outra empresa não aparecem", () => {
    expect(perfisDaEmpresa([{ id: 2, descricao: "X", empresa_id: "emp-b", ordem: 5 }], "emp-a")).toHaveLength(0);
  });
  it("Master (ordem 0) nunca aparece na lista", () => {
    expect(perfisDaEmpresa([{ id: 3, descricao: "Master", empresa_id: null, ordem: 0 }], "emp-a")).toHaveLength(0);
  });
  it("Síndico, Conselho, Portaria e Morador são da vertical Condomínios", () => {
    for (const d of ["Síndico", "Conselho", "Portaria", "Morador"]) expect(verticalDoPerfil({ descricao: d, ordem: 90 })).toBe("condominio");
    expect(verticalDoPerfil({ descricao: "Financeiro", ordem: 5 })).toBe("geral");
  });
  it("funções em /condominios são da vertical Condomínios", () => {
    expect(verticalDaRota("/condominios/assembleias")).toBe("condominio");
    expect(verticalDaRota("/financeiro/pagar")).toBe("geral");
  });
});
