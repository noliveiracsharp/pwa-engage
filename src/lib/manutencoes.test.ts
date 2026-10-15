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

import { preventivasAGerar, somarMeses } from "./manutencoes";
describe("preventivas recorrentes", () => {
  it("ajusta fim de mês", () => { expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28"); expect(somarMeses("2026-11-15", 3)).toBe("2027-02-15"); });
  it("gera com antecedência e avança a próxima data", () => {
    const r = preventivasAGerar([{ id: "a", ativo: true, proxima_data: "2026-10-20", frequencia_meses: 1, antecedencia_dias: 7 }], "2026-10-15");
    expect(r).toEqual([{ id: "a", datas: ["2026-10-20"], proxima: "2026-11-20" }]);
  });
  it("não gera antes da antecedência nem para plano inativo", () => {
    expect(preventivasAGerar([{ id: "a", ativo: true, proxima_data: "2026-10-30", frequencia_meses: 1, antecedencia_dias: 7 }], "2026-10-15")).toEqual([]);
    expect(preventivasAGerar([{ id: "b", ativo: false, proxima_data: "2026-01-01", frequencia_meses: 1, antecedencia_dias: 0 }], "2026-10-15")).toEqual([]);
  });
  it("recupera ciclos atrasados", () => {
    const r = preventivasAGerar([{ id: "a", ativo: true, proxima_data: "2026-07-01", frequencia_meses: 3, antecedencia_dias: 0 }], "2026-10-15");
    expect(r[0]!.datas).toEqual(["2026-07-01", "2026-10-01"]); expect(r[0]!.proxima).toBe("2027-01-01");
  });
});
