import { describe, expect, it } from "vitest";
import { HORARIOS_PADRAO, indiceReputacao, minutosUteis, numeroTicket, prazoSla, situacaoSla } from "./cond-atendimentos";

describe("cond-atendimentos", () => {
  it("número do ticket só com # e 6 dígitos", () => {
    expect(numeroTicket(184863)).toBe("#184863");
    expect(numeroTicket(42)).toBe("#000042");
  });
  it("SLA em horas úteis pula noite e domingo", () => {
    // sábado 15/11/2025 12:00 (9–13h) + 3h úteis → 1h no sábado, domingo fechado, segunda 8h + 2h = 10:00
    const p = prazoSla(new Date(2025, 10, 15, 12, 0), 3, HORARIOS_PADRAO);
    expect([p.getDay(), p.getHours(), p.getMinutes()]).toEqual([1, 10, 0]);
  });
  it("abertura fora do expediente começa no próximo início", () => {
    const p = prazoSla(new Date(2025, 10, 17, 20, 0), 2, HORARIOS_PADRAO); // segunda 20h
    expect([p.getDay(), p.getHours()]).toEqual([2, 10]);
  });
  it("minutos úteis entre datas", () => {
    expect(minutosUteis(new Date(2025, 10, 17, 16, 0), new Date(2025, 10, 18, 9, 0), HORARIOS_PADRAO)).toBe(120);
  });
  it("semáforo: próximo ao prazo quando restam menos de 25%", () => {
    const a = { status: "pendente_resposta", created_at: "2025-01-01T00:00:00Z", prazo_sla: "2025-01-01T10:00:00Z" };
    expect(situacaoSla(a, new Date("2025-01-01T05:00:00Z"))).toBe("dentro");
    expect(situacaoSla(a, new Date("2025-01-01T08:00:00Z"))).toBe("proximo");
    expect(situacaoSla(a, new Date("2025-01-01T11:00:00Z"))).toBe("fora");
  });
  it("reputação 100 quando tudo é perfeito e cai com notas baixas", () => {
    expect(indiceReputacao({ notas: [5, 5], noPrazo: 2, comPrazo: 2, finalizados: 2, total: 2, mediaPrimeiraRespostaMin: 60 }).indice).toBe(100);
    expect(indiceReputacao({ notas: [1, 1], noPrazo: 0, comPrazo: 2, finalizados: 1, total: 2, mediaPrimeiraRespostaMin: 1440 }).faixa).toBe("Crítica");
  });
});
