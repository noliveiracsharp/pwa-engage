import { describe, expect, it } from "vitest";
import { nomeProjetoDaOferta, ofertaTravada } from "./oferta-ativacao";

const etapas = [
  { id: "1", descricao: "Lead" },
  { id: "2", descricao: "Fechamento", ganha: true },
  { id: "3", descricao: "Ativação" },
];

describe("trava de exclusão da Oferta", () => {
  it("bloqueia oferta em Ativação", () => {
    expect(ofertaTravada({ situacao: "Ativação" }, etapas)).toBe(true);
  });
  it("bloqueia oferta em etapa marcada como ganha", () => {
    expect(ofertaTravada({ kanban_etapa_id: "2" }, etapas)).toBe(true);
  });
  it("permite apagar oferta em Lead", () => {
    expect(ofertaTravada({ situacao: "Lead", kanban_etapa_id: "1" }, etapas)).toBe(false);
  });
});

it("nome do projeto leva número da oferta e cliente", () => {
  expect(nomeProjetoDaOferta("2026-0042", "Condomínio Jardins")).toBe("[Oferta #2026-0042] Condomínio Jardins");
});
