import { describe, expect, it } from "vitest";
import { secoesComPermissao } from "./secoes-permissao";

const R = { canRead: true, canCreate: false, canUpdate: false, canDelete: false };
const ALL = { canRead: true, canCreate: true, canUpdate: true, canDelete: true };
const base = [
  { key: "dados", kind: "dados", label: "Dados" },
  { key: "notas", kind: "notas", label: "Notas rápidas" },
  { key: "ia", kind: "ia", label: "IA" },
];

describe("secoesComPermissao", () => {
  it("empresa só leitura mas notas rápidas com criação", () => {
    const s = secoesComPermissao(base, R, new Set(["dados", "notas", "ia"]), [
      { kind: "dados", ...R },
      { kind: "notas", ...ALL },
    ]);
    expect(s.find((x) => x.kind === "dados")!.perms.canUpdate).toBe(false);
    expect(s.find((x) => x.kind === "notas")!.perms.canCreate).toBe(true);
    expect(s.some((x) => x.kind === "ia")).toBe(false);
  });
  it("seção não cadastrada herda a tela pai", () => {
    const s = secoesComPermissao(base, R, new Set(), []);
    expect(s.find((x) => x.kind === "notas")!.perms.canCreate).toBe(false);
  });
});
