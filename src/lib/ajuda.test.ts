import { describe, expect, it } from "vitest";
import { ARTIGOS_PADRAO, buscarArtigos } from "./ajuda";

describe("buscarArtigos", () => {
  it("encontra o guia de cartão parcelado", () => {
    expect(buscarArtigos(ARTIGOS_PADRAO, "Como dou baixa na fatura do cartão?")[0].id).toBe("fin-cartao");
  });
  it("encontra o guia de Oferta ignorando acentos", () => {
    expect(buscarArtigos(ARTIGOS_PADRAO, "criar orcamento com desconto")[0].id).toBe("oferta-criar");
  });
  it("retorna vazio para pergunta sem termos", () => {
    expect(buscarArtigos(ARTIGOS_PADRAO, "como de")).toEqual([]);
  });
});
