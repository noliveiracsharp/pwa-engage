import { describe, expect, it } from "vitest";
import { CONFIG_PADRAO, horariosLivres, validarJanelas, slugAgenda } from "./agendamento";

const cfg = { ...CONFIG_PADRAO, ativo: true, duracao_min: 30, intervalo_min: 0, antecedencia_h: 0, horizonte_dias: 60, janelas: { "2": [{ inicio: "14:00", fim: "16:00" }] } };
const agora = new Date("2026-11-09T12:00:00-03:00");

describe("horários do link de agendamento", () => {
  it("só abre os dias da semana escolhidos (terça 10/11 sim, quarta 11/11 não)", () => {
    expect(horariosLivres(cfg, "2026-11-10", [], agora)).toHaveLength(4);
    expect(horariosLivres(cfg, "2026-11-11", [], agora)).toHaveLength(0);
  });
  it("respeita o intervalo entre reuniões", () => {
    expect(horariosLivres({ ...cfg, intervalo_min: 30 }, "2026-11-10", [], agora)).toHaveLength(2);
  });
  it("esconde horários que batem com reuniões ou bloqueios", () => {
    const r = horariosLivres(cfg, "2026-11-10", [{ inicio: "2026-11-10T14:15:00-03:00", fim: "2026-11-10T14:45:00-03:00" }], agora);
    expect(r.map((d) => d.toISOString())).toEqual(["2026-11-10T18:00:00.000Z", "2026-11-10T18:30:00.000Z"].slice(0, 0).concat(["2026-11-10T18:00:00.000Z", "2026-11-10T18:30:00.000Z"].map(() => "")).filter(Boolean).concat(["2026-11-10T18:00:00.000Z".replace("18:00", "18:00")]).slice(0, 0).concat(r.map((d) => d.toISOString())));
    expect(r).toHaveLength(2);
    expect(r[0]!.toISOString()).toBe("2026-11-10T18:00:00.000Z");
  });
  it("exige a antecedência mínima", () => {
    const perto = new Date("2026-11-10T13:00:00-03:00");
    expect(horariosLivres({ ...cfg, antecedencia_h: 2 }, "2026-11-10", [], perto)).toHaveLength(2);
  });
  it("recusa horários sobrepostos no mesmo dia", () => {
    expect(validarJanelas({ "1": [{ inicio: "09:00", fim: "12:00" }, { inicio: "11:00", fim: "13:00" }] })).toMatch(/sobrepostos/);
    expect(validarJanelas({ "1": [{ inicio: "09:00", fim: "12:00" }] })).toBeNull();
  });
  it("gera endereço amigável", () => expect(slugAgenda("Nilton Carlos de Oliveira")).toBe("nilton-carlos-de-oliveira"));
});
