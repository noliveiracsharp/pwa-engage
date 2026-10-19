import { describe, expect, it } from "vitest";
import { canaisEfetivos, deveEmitirBoleto, diasDoVencimento, etapasDoDia, preencherModelo, type Etapa } from "./regua-cobranca";

const etapas: Etapa[] = [
  { dias: -2, canais: ["whatsapp", "email"], ativo: true },
  { dias: 0, canais: ["email"], ativo: true },
  { dias: 3, canais: ["whatsapp"], ativo: false },
];

describe("régua de cobrança", () => {
  it("conta dias antes (negativo) e depois (positivo) do vencimento", () => {
    expect(diasDoVencimento("2026-10-20", "2026-10-18")).toBe(-2);
    expect(diasDoVencimento("2026-10-20", "2026-10-23")).toBe(3);
  });
  it("dispara só a etapa do dia, ignorando etapas desligadas", () => {
    expect(etapasDoDia("2026-10-20", "2026-10-18", etapas).map((e) => e.dias)).toEqual([-2]);
    expect(etapasDoDia("2026-10-20", "2026-10-23", etapas)).toEqual([]);
  });
  it("respeita a preferência do cliente e os canais ligados na empresa", () => {
    expect(canaisEfetivos(etapas[0], ["whatsapp", "email"], "email")).toEqual(["email"]);
    expect(canaisEfetivos(etapas[0], ["whatsapp"], null)).toEqual(["whatsapp"]);
    expect(canaisEfetivos(etapas[0], ["whatsapp", "email"], "nenhum")).toEqual([]);
  });
  it("emite boleto X dias antes do vencimento e nunca duas vezes", () => {
    const cfg = { modo: "dias_antes" as const, dias_antes: 5 };
    expect(deveEmitirBoleto("2026-10-20", "2026-10-15", cfg, false)).toBe(true);
    expect(deveEmitirBoleto("2026-10-20", "2026-10-14", cfg, false)).toBe(false);
    expect(deveEmitirBoleto("2026-10-20", "2026-10-15", cfg, true)).toBe(false);
  });
  it("no modo dia do mês emite só no dia escolhido", () => {
    const cfg = { modo: "dia_mes" as const, dia_mes: 25 };
    expect(deveEmitirBoleto("2026-11-10", "2026-10-25", cfg, false)).toBe(true);
    expect(deveEmitirBoleto("2026-11-10", "2026-10-24", cfg, false)).toBe(false);
  });
  it("preenche variáveis do modelo", () => {
    expect(preencherModelo("Olá {cliente}, {x}", { cliente: "Ana" })).toBe("Olá Ana, {x}");
  });
});
