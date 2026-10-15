import { describe, expect, it } from "vitest";
import { prazoSla, resumoChecklist } from "./manutencoes";

describe("manutenções", () => {
  it("conta respondidos e não conformes", () => {
    const r = resumoChecklist([
      { texto: "a", tipo: "cnc", resposta: "C" },
      { texto: "b", tipo: "cnc", resposta: "NC" },
      { texto: "c", tipo: "numero", valor: "12,4" },
      { texto: "d", tipo: "cnc", resposta: null },
    ]);
    expect(r).toEqual({ total: 4, respondidos: 3, naoConformes: 1, pct: 75 });
  });
  it("urgente tem SLA de 4 horas", () => {
    const a = new Date("2026-10-15T10:00:00Z");
    expect(prazoSla(a, "urgente").toISOString()).toBe("2026-10-15T14:00:00.000Z");
  });
});

import { mensagemOs } from "./manutencoes";
describe("mensagem ao cliente", () => {
  it("conclusão traz número, pendências e link", () => {
    const m = mensagemOs("concluida", { cliente: "Solar", numero: "OS-2026-001", tipo: "preventiva", link: "https://x/os/abc", itens: 14, naoConformes: 2 });
    expect(m).toContain("*OS-2026-001* foi concluída");
    expect(m).toContain("Itens verificados: 14 (2 com pendência)");
    expect(m).toContain("https://x/os/abc");
  });
});
