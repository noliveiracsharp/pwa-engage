import { describe, expect, it } from "vitest";
import { metricasSdr } from "./sdr-metricas";

describe("metricasSdr", () => {
  const leads = [
    { status: "novo" },
    { status: "contatado", ultimo_contato_em: "2026-10-01" },
    { status: "qualificado", ultimo_contato_em: "2026-10-01", respondeu_em: "2026-10-02" },
    { status: "convertido", ultimo_contato_em: "2026-10-01", respondeu_em: "2026-10-02" },
  ];
  it("conta o funil", () => {
    const m = metricasSdr(leads);
    expect([m.total, m.contatados, m.responderam, m.qualificados, m.convertidos]).toEqual([4, 3, 2, 2, 1]);
  });
  it("taxa de resposta sobre os contatados", () => expect(metricasSdr(leads).taxaResposta).toBe(66.7));
  it("sem contatos não divide por zero", () => expect(metricasSdr([{ status: "novo" }]).taxaConversao).toBe(0));
});
