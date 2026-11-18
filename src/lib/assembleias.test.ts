import { describe, expect, it } from "vitest";
import { direitoVoto, pesoUnidade, procuracoesExcedidas, segundaConvocacao, vereditoPauta, type OpcaoTotal } from "./assembleias";

const op = (tipo: string, peso: number, votos = 1): OpcaoTotal => ({ id: tipo, descricao: tipo, tipo, peso, votos });

describe("assembleias", () => {
  it("maioria simples aprova com mais Sim que Não entre os votantes", () => {
    expect(vereditoPauta("simples", [op("sim", 0.3), op("nao", 0.2), op("abstencao", 0.4)], 1).situacao).toBe("aprovada");
  });
  it("maioria absoluta exige mais de 50% de todo o condomínio", () => {
    expect(vereditoPauta("absoluta", [op("sim", 0.45), op("nao", 0.05)], 1).situacao).toBe("reprovada");
    expect(vereditoPauta("absoluta", [op("sim", 0.51)], 1).situacao).toBe("aprovada");
  });
  it("2/3 aprova com exatamente dois terços das unidades", () => {
    expect(vereditoPauta("dois_tercos", [op("sim", 20, 20)], 30).situacao).toBe("aprovada");
    expect(vereditoPauta("dois_tercos", [op("sim", 19, 19)], 30).situacao).toBe("reprovada");
  });
  it("unanimidade exige o condomínio inteiro", () => {
    expect(vereditoPauta("unanimidade", [op("sim", 29, 29)], 30).situacao).toBe("reprovada");
  });
  it("eleição elege a chapa com mais peso e acusa empate", () => {
    expect(vereditoPauta("eleicao", [{ ...op("outro", 0.6), descricao: "Chapa 1" }, { ...op("outro", 0.4), id: "b", descricao: "Chapa 2" }], 1).vencedora).toBe("Chapa 1");
    expect(vereditoPauta("eleicao", [op("outro", 0.5), { ...op("outro", 0.5), id: "b" }], 1).situacao).toBe("empate");
  });
  it("peso por unidade é 1 e por fração usa a fração ideal", () => {
    expect(pesoUnidade("unidade", 0.07)).toBe(1);
    expect(pesoUnidade("fracao_ideal", 0.07)).toBe(0.07);
  });
  it("inadimplente só vota com liberação justificada", () => {
    expect(direitoVoto(false)).toBe(false);
    expect(direitoVoto(false, "Comprovante apresentado")).toBe(true);
  });
  it("limite de procurações barra a partir do limite", () => {
    expect(procuracoesExcedidas(2, 2)).toBe(true);
    expect(procuracoesExcedidas(5, 0)).toBe(false);
  });
  it("2ª convocação fica 30 minutos após a 1ª", () => {
    expect(segundaConvocacao("2026-11-20T19:00:00.000Z")).toBe("2026-11-20T19:30:00.000Z");
  });
});

import { abaInicialAssembleias, grupoAssembleia } from "./assembleias";
describe("abas de assembleias", () => {
  it("agrupa sessão permanente em andamento e cancelada em encerradas", () => {
    expect(grupoAssembleia("sessao_permanente")).toBe("andamento");
    expect(grupoAssembleia("cancelada")).toBe("encerradas");
  });
  it("abre em andamento quando há assembleia ao vivo", () => {
    expect(abaInicialAssembleias(["convocada", "em_andamento"], true)).toBe("andamento");
  });
  it("sem ao vivo abre em convocadas; morador nunca abre em rascunho", () => {
    expect(abaInicialAssembleias(["finalizada", "convocada"], false)).toBe("convocadas");
    expect(abaInicialAssembleias(["rascunho"], false)).toBe("convocadas");
  });
});
