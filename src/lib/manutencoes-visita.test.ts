import { describe, expect, it } from "vitest";
import { checklistDaVisita } from "./manutencoes";

describe("preventiva por cliente", () => {
  const modelos = [{ id: "m1", itens: [{ texto: "A", tipo: "cnc" }, { texto: "B", tipo: "cnc" }] }, { id: "m2", itens: [{ texto: "C", tipo: "numero", unidade: "V" }] }];
  const ativos = [{ id: "a1", nome: "Motor", local: "Garagem" }, { id: "a2", nome: "Facial" }];
  it("junta o checklist de cada equipamento numa visita só, marcando o equipamento", () => {
    const c = checklistDaVisita([{ ativo_id: "a1", modelo_id: "m1" }, { ativo_id: "a2", modelo_id: "m2" }], modelos, ativos);
    expect(c.map((i) => [i.equipamento, i.texto])).toEqual([["Motor · Garagem", "A"], ["Motor · Garagem", "B"], ["Facial", "C"]]);
  });
  it("ignora equipamento sem checklist ou excluído", () => {
    expect(checklistDaVisita([{ ativo_id: "a1", modelo_id: "" }, { ativo_id: "x", modelo_id: "m1" }], modelos, ativos)).toEqual([]);
  });
});
