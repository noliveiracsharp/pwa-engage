import { describe, expect, it } from "vitest";
import { BLOQUEIO_MS, estadoInicial, registrarFalha, restanteMs } from "./login-limite";

describe("bloqueio de login", () => {
  it("4 falhas não bloqueiam", () => {
    let e = estadoInicial();
    for (let i = 0; i < 4; i++) e = registrarFalha(e, 1000);
    expect(restanteMs(e, 1000)).toBe(0);
  });
  it("5ª falha bloqueia por 15 minutos", () => {
    let e = estadoInicial();
    for (let i = 0; i < 5; i++) e = registrarFalha(e, 1000);
    expect(restanteMs(e, 1000)).toBe(15 * 60 * 1000);
    expect(restanteMs(e, 1000 + BLOQUEIO_MS)).toBe(0);
  });
  it("após o bloqueio expirar, a contagem recomeça", () => {
    let e = estadoInicial();
    for (let i = 0; i < 5; i++) e = registrarFalha(e, 0);
    e = registrarFalha(e, BLOQUEIO_MS + 1);
    expect(e.falhas).toBe(1);
    expect(restanteMs(e, BLOQUEIO_MS + 1)).toBe(0);
  });
});
