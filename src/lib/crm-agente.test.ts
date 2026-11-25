import { describe, expect, it } from "vitest";
import { lerAcaoAgente } from "./crm-agente";

describe("lerAcaoAgente", () => {
  it("visita agendada vira tipo visita com data", () => {
    const a = lerAcaoAgente('```json\n{"cliente":"Cond. Aurora","tipo":"nota","resumo":"Agendei visita","visita_em":"2026-12-01T10:00:00-03:00","tecnico":"João"}\n```');
    expect(a?.tipo).toBe("visita");
    expect(a?.visita_em).toBe("2026-12-01T13:00:00.000Z");
    expect(a?.tecnico).toBe("João");
  });
  it("sem cliente citado não executa nada", () => {
    expect(lerAcaoAgente('{"cliente":"","resumo":""}')).toBeNull();
  });
  it("tipo desconhecido vira nota", () => {
    expect(lerAcaoAgente('{"cliente":"X","tipo":"fax","resumo":"r"}')?.tipo).toBe("nota");
  });
});
