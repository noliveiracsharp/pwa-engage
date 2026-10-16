import { describe, it, expect } from "vitest";
import { periodoMesVigente } from "./utils";
describe("periodoMesVigente", () => {
  it("outubro/2026", () => expect(periodoMesVigente(new Date(2026, 9, 16))).toEqual({ de: "2026-10-01", ate: "2026-10-31" }));
  it("fevereiro bissexto", () => expect(periodoMesVigente(new Date(2028, 1, 5))).toEqual({ de: "2028-02-01", ate: "2028-02-29" }));
});
