import { describe, expect, it } from "vitest";
import { ARTIGOS_PADRAO, buscarArtigos } from "./ajuda";

describe("buscarArtigos", () => {
  it("encontra o guia de cartão parcelado", () => {
    expect(buscarArtigos(ARTIGOS_PADRAO, "Como dou baixa na fatura do cartão?")[0]?.id).toBe("fin-cartao");
  });
  it("encontra o guia de Oferta ignorando acentos", () => {
    expect(buscarArtigos(ARTIGOS_PADRAO, "criar orcamento com desconto")[0]?.id).toBe("oferta-criar");
  });
  it("retorna vazio para pergunta sem termos", () => {
    expect(buscarArtigos(ARTIGOS_PADRAO, "como de")).toEqual([]);
  });
  it("encontra o guia de captação de leads", () => {
    expect(buscarArtigos(ARTIGOS_PADRAO, "roleta de leads do site")[0]?.id).toBe("crm-captacao");
  });
});
describe("novos guias", () => {
  it("encontra preventiva por cliente", () => {
    expect(buscarArtigos(ARTIGOS_PADRAO, "preventiva checklist por equipamento")[0]?.id).toBe("manu-preventivas-cliente");
  });
  it("encontra o DRE gerencial", () => {
    expect(buscarArtigos(ARTIGOS_PADRAO, "dre gerencial competencia")[0]?.id).toBe("fin-dre-gerencial");
  });
});

import { mesclarArtigos } from "./ajuda";
describe("mesclarArtigos", () => {
  const of = [{ id: "a", modulo: "M", titulo: "Oficial", resumo: "r", passos: ["p"] }];
  it("personalização com chave substitui o guia oficial e ganha o print", () => {
    const r = mesclarArtigos(of, [{ id: "db-1", dbId: "1", chave: "a", modulo: "M", titulo: "Novo título", resumo: "r", passos: ["p"], imagem: "https://x/y.webp" }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: "a", titulo: "Novo título", imagem: "https://x/y.webp" });
  });
  it("registro sem chave vira guia extra", () => {
    expect(mesclarArtigos(of, [{ id: "db-2", dbId: "2", modulo: "M", titulo: "Extra", resumo: "", passos: [] }])).toHaveLength(2);
  });
});
