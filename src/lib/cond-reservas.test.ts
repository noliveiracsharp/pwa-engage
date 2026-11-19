import { describe, expect, it } from "vitest";
import { dataMaxima, estruturaTravada, validarReserva, type Contexto, type RegrasEspaco } from "./cond-reservas";

const base: RegrasEspaco = { id: "salao", dias_min: 0, dias_max: 90, periodo_cota: "pendente", horas_entre: 0, hora_inicio: "07:00", hora_fim: "21:00", simultaneas: 1, bloqueio_antes_h: 0, bloqueio_depois_h: 0, horarios_bloqueados: [] };
const agora = new Date(2026, 10, 19, 10, 0);
const ctx = (p: Partial<Contexto> = {}): Contexto => ({ agora, reservas: [], datasBloqueadas: [], unidadesBloqueadas: [], concorrencias: [], ...p });
const r = (d: number, h1: number, h2: number, extra: object = {}) => ({ espaco_id: "salao", unidade_id: "u1", inicio: new Date(2026, 10, d, h1), fim: new Date(2026, 10, d, h2), ...extra });

describe("validarReserva", () => {
  it("permite reserva válida", () => expect(validarReserva(base, r(25, 10, 12), ctx())).toEqual([]));
  it("respeita dias máximos (90)", () => expect(dataMaxima(base, agora)).toEqual(new Date(2027, 1, 17)));
  it("bloqueia fora do horário 07h-21h", () => expect(validarReserva(base, r(25, 20, 22), ctx()).length).toBe(1));
  it("bloqueia data comemorativa", () => expect(validarReserva(base, r(25, 10, 12), ctx({ datasBloqueadas: ["2026-11-25"] }))).toHaveLength(1));
  it("bloqueia hora da matriz semanal", () => expect(validarReserva({ ...base, horarios_bloqueados: ["3-11"] }, r(25, 10, 12), ctx())).toHaveLength(1));
  it("unidade bloqueada sem datas = indefinido", () => expect(validarReserva(base, r(25, 10, 12), ctx({ unidadesBloqueadas: [{ unidade_id: "u1" }] }))).toHaveLength(1));
  it("bloqueio de unidade vencido não vale", () => expect(validarReserva(base, r(25, 10, 12), ctx({ unidadesBloqueadas: [{ unidade_id: "u1", data_fim: "2026-11-20" }] }))).toEqual([]));
  it("horas depois de uma reserva bloqueiam", () => {
    const reservas = [{ ...r(25, 8, 10, { unidade_id: "u2" }), status: "aprovada" }];
    expect(validarReserva({ ...base, bloqueio_depois_h: 2 }, r(25, 11, 12), ctx({ reservas }))).toHaveLength(1);
    expect(validarReserva(base, r(25, 11, 12), ctx({ reservas }))).toEqual([]);
  });
  it("concorrência mesma unidade x todas", () => {
    const reservas = [{ ...r(25, 8, 10, { espaco_id: "churrasq", unidade_id: "u2" }), status: "aprovada" }];
    expect(validarReserva(base, r(25, 14, 16), ctx({ reservas, concorrencias: [{ espaco_id: "salao", outro_espaco_id: "churrasq", modo: "mesma_unidade" }] }))).toEqual([]);
    expect(validarReserva(base, r(25, 14, 16), ctx({ reservas, concorrencias: [{ espaco_id: "salao", outro_espaco_id: "churrasq", modo: "todas_unidades" }] }))).toHaveLength(1);
  });
  it("cota mensal por unidade", () => {
    const reservas = [{ ...r(21, 8, 10), status: "aprovada" }];
    expect(validarReserva({ ...base, max_por_unidade: 1, periodo_cota: "mensal" }, r(25, 14, 16), ctx({ reservas }))).toHaveLength(1);
  });
  it("cancelada não ocupa nem trava", () => {
    const reservas = [{ ...r(25, 10, 12), status: "cancelada" }];
    expect(validarReserva(base, r(25, 10, 12), ctx({ reservas }))).toEqual([]);
    expect(estruturaTravada("salao", reservas, agora)).toBe(false);
    expect(estruturaTravada("salao", [{ ...reservas[0]!, status: "aprovada" }], agora)).toBe(true);
  });
});
