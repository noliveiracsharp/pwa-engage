import { describe, expect, it } from "vitest";
import { reajusteEmCarencia, situacaoTitulo, valorReajustado } from "@/lib/financeiro";

describe("reajuste anual", () => {
  it("avisa se reajustado há menos de 12 meses", () => {
    expect(reajusteEmCarencia({ reajustado_em: "2026-01-15" }, "2026-12-14")).toBe(true);
  });
  it("libera após 12 meses completos", () => {
    expect(reajusteEmCarencia({ reajustado_em: "2025-10-19" }, "2026-10-19")).toBe(false);
  });
  it("aplica percentual IPCA", () => {
    expect(valorReajustado(1000, 4.5)).toBe(1045);
  });
});

describe("agendado", () => {
  it("título em aberto com data agendada aparece como agendado", () => {
    expect(situacaoTitulo({ status: "aberto", vencimento: "2026-01-01", agendado_para: "2026-11-01" }, "2026-10-19")).toBe("agendado");
  });
  it("pago não vira agendado", () => {
    expect(situacaoTitulo({ status: "pago", agendado_para: "2026-11-01" }, "2026-10-19")).toBe("pago");
  });
});

import { infoReajuste as _info } from "./financeiro";
describe("infoReajuste pela competência", () => {
  it("competência há 4 meses: faltam 8", () => {
    expect(_info({ data_competencia: "2026-06-19" }, "2026-10-19").faltam).toBe(8);
  });
  it("competência há 12 meses: apto", () => {
    expect(_info({ data_competencia: "2025-10-19" }, "2026-10-19").emCarencia).toBe(false);
  });
  it("último reajuste tem prioridade", () => {
    expect(_info({ data_competencia: "2024-01-01", reajustado_em: "2026-05-19" }, "2026-10-19").faltam).toBe(7);
  });
});
