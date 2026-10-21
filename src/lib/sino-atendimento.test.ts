import { describe, expect, it } from "vitest";
import { aposEnvio, ligarSino, lerSino, sinoVencido, textoSino } from "./sino-atendimento";

const agora = new Date("2026-10-21T12:00:00Z");

describe("sino de tranquilização", () => {
  it("ligar agenda o primeiro envio após o intervalo", () => {
    const p = ligarSino({ intervaloMin: 3, mensagem: "x", maxEnvios: 3 }, agora);
    expect(p.sino_proximo_envio).toBe("2026-10-21T12:03:00.000Z");
    expect(p.sino_envios_feitos).toBe(0);
  });
  it("limite máximo é 5 envios", () => {
    expect(ligarSino({ intervaloMin: 2, mensagem: "x", maxEnvios: 9 }, agora).sino_max_envios).toBe(5);
  });
  it("só vence quando chega a hora", () => {
    const s = lerSino({ sino_ativo: true, sino_intervalo_min: 3, sino_max_envios: 3, sino_envios_feitos: 0, sino_proximo_envio: "2026-10-21T12:03:00Z" });
    expect(sinoVencido(s, agora)).toBe(false);
    expect(sinoVencido(s, new Date("2026-10-21T12:03:00Z"))).toBe(true);
  });
  it("desarma ao atingir o teto de envios", () => {
    const s = lerSino({ sino_ativo: true, sino_intervalo_min: 3, sino_max_envios: 3, sino_envios_feitos: 2 });
    const r = aposEnvio(s, agora);
    expect(r.sino_ativo).toBe(false);
    expect(r.limiteAtingido).toBe(true);
  });
  it("troca {nome} pelo primeiro nome", () => {
    expect(textoSino("Olá {nome}, aguarde", "Maria Souza")).toBe("Olá Maria, aguarde");
  });
});
