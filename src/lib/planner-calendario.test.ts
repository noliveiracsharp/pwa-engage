import { describe, expect, it } from "vitest";
import { intervaloDaVista } from "./planner-calendario";
describe("intervaloDaVista", () => {
  it("semana começa na segunda", () => expect(intervaloDaVista("semana", "2026-10-30", "", "")).toMatchObject({ de: "2026-10-26", ate: "2026-11-01" }));
  it("mês cobre do dia 1 ao último", () => expect(intervaloDaVista("mes", "2026-02-10", "", "")).toMatchObject({ de: "2026-02-01", ate: "2026-02-28" }));
  it("personalizado respeita início e fim", () => expect(intervaloDaVista("personalizado", "2026-10-30", "2026-11-05", "2026-11-01")).toMatchObject({ de: "2026-11-01", ate: "2026-11-05" }));
});
