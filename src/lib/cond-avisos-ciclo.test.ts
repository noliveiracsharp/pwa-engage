import { describe, expect, it } from "vitest";
import { acoesDoAviso, avisoExpirado, cancelamentoNotifica, percentualEnvio, statusDoAviso, validarAgendamento } from "./cond-avisos-ciclo";

describe("ciclo de avisos", () => {
  it("data final em branco nunca expira", () => {
    expect(avisoExpirado(null, new Date(2030, 0, 1))).toBe(false);
  });
  it("expira só depois do dia final", () => {
    expect(avisoExpirado("2026-11-07", new Date(2026, 10, 7))).toBe(false);
    expect(avisoExpirado("2026-11-07", new Date(2026, 10, 8))).toBe(true);
  });
  it("editar aviso já enviado cria nova versão", () => {
    expect(acoesDoAviso("enviado").editarCriaVersao).toBe(true);
    expect(acoesDoAviso("agendado").editarCriaVersao).toBe(false);
  });
  it("aviso cancelado não pode ser cancelado nem editado de novo", () => {
    const a = acoesDoAviso("cancelado");
    expect(a.cancelar).toBe(false);
    expect(a.editar).toBe(false);
  });
  it("cancelar só notifica quando alguém já recebeu", () => {
    expect(cancelamentoNotifica("enviado", 3)).toBe(true);
    expect(cancelamentoNotifica("agendado", 0)).toBe(false);
  });
  it("aviso antigo sem status conta como enviado", () => {
    expect(statusDoAviso(undefined)).toBe("enviado");
  });
  it("percentual do envio", () => {
    expect(percentualEnvio(1000, 2000)).toBe(50);
    expect(percentualEnvio(0, 0)).toBe(0);
  });
  it("agendamento precisa ser futuro", () => {
    const agora = new Date("2026-11-07T12:00:00Z");
    expect(validarAgendamento("2026-11-07T11:00:00Z", agora)).not.toBeNull();
    expect(validarAgendamento("2026-11-08T11:00:00Z", agora)).toBeNull();
  });
});

import { canalDoLink, ehRoboDeEmail } from "./cond-avisos-ciclo";
describe("leitura real de avisos", () => {
  it("ignora o proxy de imagens do Gmail e pedidos sem identificação", () => {
    expect(ehRoboDeEmail("Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)")).toBe(true);
    expect(ehRoboDeEmail("")).toBe(true);
    expect(ehRoboDeEmail("Mozilla/5.0")).toBe(true);
  });
  it("aceita navegador/app de uma pessoa", () => {
    expect(ehRoboDeEmail("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")).toBe(false);
  });
  it("link pessoal registra o canal por onde recebeu", () => {
    expect(canalDoLink("whatsapp")).toBe("whatsapp");
    expect(canalDoLink("x")).toBe("sistema");
  });
});
