import { describe, expect, it } from "vitest";
import { passosImplantacao, progressoImplantacao } from "./implantacao";

const vazio = { instancias: [], usuarios: [], itens: [], parceiros: [], contas: [], ofertas: [] };

describe("checklist de implantação", () => {
  it("empresa nova começa com 0 de 7", () => {
    expect(progressoImplantacao(passosImplantacao(vazio))).toEqual({ feitos: 0, total: 7, pct: 0 });
  });
  it("equipe só conta com pelo menos 2 usuários", () => {
    const um = passosImplantacao({ ...vazio, usuarios: [{ id: 1 }] }).find((p) => p.id === "equipe");
    const dois = passosImplantacao({ ...vazio, usuarios: [{ id: 1 }, { id: 2 }] }).find((p) => p.id === "equipe");
    expect(um?.feito).toBe(false);
    expect(dois?.feito).toBe(true);
  });
  it("WhatsApp conta quando o recebimento está ativo", () => {
    const p = passosImplantacao({ ...vazio, instancias: [{ webhook_ativo: true }] }).find((x) => x.id === "whatsapp");
    expect(p?.feito).toBe(true);
  });
});
