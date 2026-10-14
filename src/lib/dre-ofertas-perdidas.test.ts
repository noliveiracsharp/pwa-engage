import { describe, it, expect } from "vitest";
import { etapaPerdida } from "./dre-ofertas";
describe("etapaPerdida", () => {
  it("Desistência é perdida", () => expect(etapaPerdida("Desistência")).toBe(true));
  it("Fechamento não é perdida", () => expect(etapaPerdida("Fechamento")).toBe(false));
});
