import { describe, it, expect } from "vitest";
import { etapaOfertaHoje, ofertaPodeAcompanhar, REGUA_OFERTA_PADRAO, ETAPAS_OFERTA } from "./regua-ofertas";
import { resultadoWhatsApp, telefoneConsulta } from "./whatsapp-verificacao";
describe("acompanhamento de Ofertas", () => {
  it("acompanha dois dias após o envio real, não a criação", () => {
    const e = ETAPAS_OFERTA[0]; if (!e) throw new Error("Etapa ausente");
    expect(etapaOfertaHoje(e, { acompanhamento_enviado_em: "2026-10-19T12:00:00Z" }, "2026-10-21")).toBe(true);
    expect(etapaOfertaHoje(e, { dt_orcamento: "2026-10-19" }, "2026-10-21")).toBe(false);
  });
  it("lembra dois dias antes da validade", () => {
    const e = ETAPAS_OFERTA[2]; if (!e) throw new Error("Etapa ausente");
    expect(etapaOfertaHoje(e, { acompanhamento_enviado_em: "2026-10-19", validade_orcamento: "2026-10-30" }, "2026-10-28")).toBe(true);
    expect(etapaOfertaHoje(e, { acompanhamento_enviado_em: "2026-10-19", validade_orcamento: "2026-10-30" }, "2026-10-27")).toBe(false);
  });
  it.each(["Aprovado", "Perdida", "Cancelada", "Ativação"])("para em %s mesmo se incluída na configuração", situacao => {
    expect(ofertaPodeAcompanhar({ situacao }, { ...REGUA_OFERTA_PADRAO, situacoes: [situacao] })).toBe(false);
  });
  it("para quando assinada ou em etapa ganha personalizada", () => {
    expect(ofertaPodeAcompanhar({ situacao: "Em andamento", assinado_em: "2026-10-19" }, REGUA_OFERTA_PADRAO)).toBe(false);
    expect(ofertaPodeAcompanhar({ situacao: "Em andamento" }, REGUA_OFERTA_PADRAO, true)).toBe(false);
    expect(ofertaPodeAcompanhar({ situacao: "Em andamento" }, REGUA_OFERTA_PADRAO)).toBe(true);
  });
});
describe("consulta WhatsApp", () => {
  it("normaliza o telefone sem perder o país", () => {
    expect(telefoneConsulta("(11) 99999-9999")).toBe("5511999999999");
    expect(telefoneConsulta("+1 202 555 0123")).toBe("12025550123");
    expect(telefoneConsulta("123")).toBe(null);
  });
  it("não confunde falha do provedor com ausência de WhatsApp", () => {
    expect(resultadoWhatsApp({ exists: true })).toBe(true);
    expect(resultadoWhatsApp({ exists: false })).toBe(false);
    expect(resultadoWhatsApp({ error: "disconnected" })).toBe(null);
  });
});
