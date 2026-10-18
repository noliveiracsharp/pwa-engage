import { describe, expect, it } from "vitest";
import { navegarPeriodo, periodoPreset, rotuloPeriodo } from "./periodo-vencimento";

describe("periodo de vencimento", () => {
  it("este mês e setas pulam mês", () => {
    const p = periodoPreset("mes", "2026-10-18");
    expect(p).toMatchObject({ de: "2026-10-01", ate: "2026-10-31" });
    expect(navegarPeriodo(p, 1)).toMatchObject({ de: "2026-11-01", ate: "2026-11-30" });
    expect(navegarPeriodo(periodoPreset("mes", "2028-01-10"), 1)).toMatchObject({ ate: "2028-02-29" });
    expect(rotuloPeriodo(p)).toBe("Outubro de 2026");
  });
  it("semana vai de segunda a domingo", () => {
    const p = periodoPreset("semana", "2026-10-18");
    expect(p).toMatchObject({ de: "2026-10-12", ate: "2026-10-18" });
    expect(navegarPeriodo(p, -1)).toMatchObject({ de: "2026-10-05", ate: "2026-10-11" });
  });
  it("hoje anda um dia e ano anda um ano", () => {
    expect(navegarPeriodo(periodoPreset("hoje", "2026-12-31"), 1)).toMatchObject({ de: "2027-01-01" });
    expect(navegarPeriodo(periodoPreset("ano", "2026-05-05"), -1)).toMatchObject({ de: "2025-01-01", ate: "2025-12-31" });
  });
  it("últimos 30 dias e todo o período", () => {
    expect(periodoPreset("30d", "2026-10-30")).toMatchObject({ de: "2026-10-01", ate: "2026-10-30" });
    const t = periodoPreset("todo");
    expect(navegarPeriodo(t, 1)).toEqual(t);
  });
});
