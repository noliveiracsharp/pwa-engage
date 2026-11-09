import { describe, expect, it } from "vitest";
import { statusSla } from "./sla-etapa";

const agora = new Date("2026-11-10T12:00:00Z");
const ha = (min: number) => new Date(agora.getTime() - min * 60000).toISOString();

describe("SLA por etapa", () => {
  it("etapa sem SLA não sinaliza", () => expect(statusSla(ha(500), null, agora).estado).toBe("sem_sla"));
  it("dentro do prazo fica ok", () => expect(statusSla(ha(60), 2, agora)).toEqual({ estado: "ok", restanteMin: 60 }));
  it("a partir de 80% do prazo fica em atenção", () => expect(statusSla(ha(96), 2, agora).estado).toBe("atencao"));
  it("passou do prazo fica estourado", () => expect(statusSla(ha(150), 2, agora)).toEqual({ estado: "estourado", restanteMin: -30 }));
});
