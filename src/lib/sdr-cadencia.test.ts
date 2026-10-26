import { describe, expect, it } from "vitest";
import { PASSOS_PADRAO, horarioComercial, passoDevido, preencherTexto, proximaData, temCanal } from "./sdr-cadencia";

describe("sequência do SDR", () => {
  it("primeiro passo é e-mail no dia 0 e WhatsApp no dia seguinte", () => {
    expect(PASSOS_PADRAO[0]!.canal).toBe("email");
    expect(PASSOS_PADRAO[1]!.canal).toBe("whatsapp");
    expect(proximaData(PASSOS_PADRAO, 0, "2026-10-26")).toBe("2026-10-27");
  });
  it("para quando o lead responde (qualificado)", () => {
    expect(passoDevido({ cadencia_ativa: true, status: "qualificado" }, PASSOS_PADRAO, "2026-10-26")).toBeNull();
  });
  it("não dispara antes da data do próximo passo", () => {
    expect(passoDevido({ cadencia_ativa: true, cadencia_passo: 1, cadencia_proxima: "2026-10-27" }, PASSOS_PADRAO, "2026-10-26")).toBeNull();
    expect(passoDevido({ cadencia_ativa: true, cadencia_passo: 1, cadencia_proxima: "2026-10-27" }, PASSOS_PADRAO, "2026-10-27")?.indice).toBe(1);
  });
  it("termina após o último passo", () => {
    expect(proximaData(PASSOS_PADRAO, 2, "2026-10-26")).toBeNull();
    expect(passoDevido({ cadencia_ativa: true, cadencia_passo: 3 }, PASSOS_PADRAO, "2026-10-26")).toBeNull();
  });
  it("horário comercial: seg-sex 8h às 18h de Brasília", () => {
    expect(horarioComercial(new Date("2026-10-26T12:00:00Z"))).toBe(true); // seg 9h
    expect(horarioComercial(new Date("2026-10-26T22:00:00Z"))).toBe(false); // seg 19h
    expect(horarioComercial(new Date("2026-10-25T14:00:00Z"))).toBe(false); // domingo
  });
  it("preenche variáveis e valida canais", () => {
    expect(preencherTexto("Oi {{empresa}} de {{cidade}}", { empresa: "Cond. Sol", cidade: "Campinas" })).toBe("Oi Cond. Sol de Campinas");
    expect(temCanal({ telefone: "(19) 99999-0000" }, "whatsapp")).toBe(true);
    expect(temCanal({ email: "x" }, "email")).toBe(false);
  });
});
