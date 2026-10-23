import { describe, expect, it } from "vitest";
import { etiquetasDoQuadro } from "./etiquetas";

const ets = [
  { id: "1", kanban_id: null },
  { id: "2", kanban_id: "ofertas" },
  { id: "3", kanban_id: "suporte" },
];

describe("etiquetasDoQuadro", () => {
  it("mostra globais e as do quadro atual", () => {
    expect(etiquetasDoQuadro(ets, "suporte").map((e) => e.id)).toEqual(["1", "3"]);
  });
  it("sem quadro mostra só as globais", () => {
    expect(etiquetasDoQuadro(ets, "").map((e) => e.id)).toEqual(["1"]);
  });
});
