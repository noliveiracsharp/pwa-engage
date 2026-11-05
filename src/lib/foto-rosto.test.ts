import { describe, expect, it } from "vitest";
import { avaliarRosto, quadroRosto } from "./foto-rosto";

describe("quadroRosto", () => {
  it("gera recorte quadrado contendo o rosto", () => {
    const q = quadroRosto({ x: 400, y: 300, w: 200, h: 200 }, 1200, 1200);
    expect(q.w).toBe(q.h);
    expect(q.x).toBeLessThanOrEqual(400);
    expect(q.x + q.w).toBeGreaterThanOrEqual(600);
  });
  it("não sai da imagem quando o rosto está na borda", () => {
    const q = quadroRosto({ x: 0, y: 0, w: 300, h: 300 }, 800, 600);
    expect(q.x).toBe(0);
    expect(q.y).toBe(0);
    expect(q.w).toBeLessThanOrEqual(600);
  });
});

describe("avaliarRosto", () => {
  it("recusa foto sem rosto", () => expect(avaliarRosto(0, null, 1000).ok).toBe(false));
  it("recusa duas pessoas", () => expect(avaliarRosto(2, { x: 0, y: 0, w: 300, h: 300 }, 1000).ok).toBe(false));
  it("recusa rosto pequeno", () => expect(avaliarRosto(1, { x: 0, y: 0, w: 60, h: 60 }, 1000).ok).toBe(false));
  it("aceita um rosto grande", () => expect(avaliarRosto(1, { x: 0, y: 0, w: 300, h: 300 }, 1000).ok).toBe(true));
});

import { avaliarAoVivo as aoVivo, avaliarLuz as luz } from "./foto-rosto";
describe("avaliarAoVivo", () => {
  it("rosto centralizado e de tamanho bom passa", () => {
    expect(aoVivo(1, { x: 220, y: 120, w: 200, h: 200 }, 640, 480).ok).toBe(true);
  });
  it("sem rosto, dois rostos, longe e descentralizado falham", () => {
    expect(aoVivo(0, null, 640, 480).ok).toBe(false);
    expect(aoVivo(2, { x: 220, y: 120, w: 200, h: 200 }, 640, 480).aviso).toMatch(/uma pessoa/);
    expect(aoVivo(1, { x: 300, y: 200, w: 60, h: 60 }, 640, 480).aviso).toMatch(/Aproxime/);
    expect(aoVivo(1, { x: 0, y: 120, w: 200, h: 200 }, 640, 480).aviso).toMatch(/Centralize/);
  });
  it("cabeça inclinada falha", () => {
    const r = aoVivo(1, { x: 220, y: 120, w: 200, h: 200 }, 640, 480, { esq: { x: 0.4, y: 0.4 }, dir: { x: 0.6, y: 0.5 } });
    expect(r.aviso).toMatch(/reta/);
  });
  it("luz escura e forte falham", () => {
    expect(luz(30).ok).toBe(false); expect(luz(240).ok).toBe(false); expect(luz(130).ok).toBe(true);
  });
});
