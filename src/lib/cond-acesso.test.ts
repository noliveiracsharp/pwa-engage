import { describe, expect, it } from "vitest";
import { agendaVazia, copiarParaUteis, errosAgenda, sincronizaFacial } from "./cond-acesso";

const comSeg = () => { const a = agendaVazia(); a.seg = { ativo: true, entrada: "08:00", saida: "17:00" }; return a; };

describe("acesso facial de prestadores", () => {
  it("anunciado pela portaria não sincroniza a facial", () => {
    expect(sincronizaFacial({ controle: true, anunciado: true, agenda: comSeg() })).toBe(false);
  });
  it("sem anúncio e com dia válido sincroniza", () => {
    expect(sincronizaFacial({ controle: true, anunciado: false, agenda: comSeg() })).toBe(true);
  });
  it("sem nenhum dia autorizado não sincroniza", () => {
    expect(sincronizaFacial({ controle: true, anunciado: false, agenda: agendaVazia() })).toBe(false);
  });
  it("vigência expirada não sincroniza", () => {
    expect(sincronizaFacial({ controle: true, anunciado: false, agenda: comSeg(), fim: "2026-01-01", hoje: "2026-02-01" })).toBe(false);
  });
  it("saída antes da entrada é erro", () => {
    const a = agendaVazia(); a.ter = { ativo: true, entrada: "18:00", saida: "08:00" };
    expect(errosAgenda(a)).toHaveLength(1);
  });
  it("copia segunda para sexta", () => {
    expect(copiarParaUteis(comSeg()).sex.entrada).toBe("08:00");
  });
});
