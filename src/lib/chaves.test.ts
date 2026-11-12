import { describe, expect, it } from "vitest";
import { previstoPara, situacaoPrazo, textoPrazo } from "./chaves";

const t0 = new Date("2026-11-12T10:00:00Z");
const mais = (m: number) => new Date(t0.getTime() + m * 60_000);

describe("prazo de chaves", () => {
  it("1 hora de prazo vence 60 min após a retirada", () => {
    expect(previstoPara(t0, 60)?.toISOString()).toBe("2026-11-12T11:00:00.000Z");
  });
  it("sem prazo não gera vencimento", () => {
    expect(previstoPara(t0, null)).toBeNull();
    expect(situacaoPrazo(null, t0)).toBe("sem_prazo");
  });
  it("faltando 15 min ou menos fica em atenção", () => {
    expect(situacaoPrazo(mais(15), t0)).toBe("atencao");
    expect(situacaoPrazo(mais(16), t0)).toBe("no_prazo");
  });
  it("passou do prazo fica atrasada e mostra há quanto tempo", () => {
    expect(situacaoPrazo(mais(-35), t0)).toBe("atrasada");
    expect(textoPrazo(mais(-35), t0)).toBe("Atrasada há 35 min");
    expect(textoPrazo(mais(90), t0)).toBe("Resta 1h 30min");
  });
});
