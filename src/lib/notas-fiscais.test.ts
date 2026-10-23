import { describe, expect, it } from "vitest";
import { notasDaOferta, pendenciasNota, tipoDoItem } from "./notas-fiscais";

const cat = new Map([["p1", { descricao: "Câmera", ncm: "85258929" }], ["s1", { descricao: "Instalação", lc116: "14.01" }]]);
const orc = { id: "o1", parceiro_id: "c1" };

describe("notas fiscais", () => {
  it("produto vira NF-e e serviço vira NFS-e", () => {
    expect(tipoDoItem("produto")).toBe("nfe");
    expect(tipoDoItem("servico")).toBe("nfse");
  });
  it("separa produtos e serviços em notas distintas", () => {
    const n = notasDaOferta(orc, [
      { item_id: "p1", natureza: "produto", quantidade: 2, valor_unitario: 100 },
      { item_id: "s1", natureza: "servico", quantidade: 1, valor_unitario: 300 },
    ], cat);
    expect(n.map((x) => [x.tipo, x.valor])).toEqual([["nfe", 200], ["nfse", 300]]);
  });
  it("recorrência não entra junto com implantação", () => {
    const n = notasDaOferta(orc, [
      { item_id: "s1", natureza: "servico", quantidade: 1, valor_unitario: 300 },
      { item_id: "s1", natureza: "recorrente", quantidade: 1, valor_unitario: 99 },
    ], cat);
    expect(n).toHaveLength(1);
    expect(n[0]!.valor).toBe(300);
  });
  it("separa por pagador quando o item é faturado para outro parceiro", () => {
    const n = notasDaOferta(orc, [
      { item_id: "s1", natureza: "servico", quantidade: 1, valor_unitario: 300 },
      { item_id: "s1", natureza: "servico", quantidade: 1, valor_unitario: 50, faturar_para_id: "c2" },
    ], cat);
    expect(n.map((x) => x.parceiro_id).sort()).toEqual(["c1", "c2"]);
  });
  it("NF-e sem NCM fica pendente", () => {
    const p = pendenciasNota({ tipo: "nfe", parceiro_id: "c1", valor: 10, itens: [{ item_id: null, descricao: "X", quantidade: 1, valor_unitario: 10, total: 10 }] }, "12345678000190");
    expect(p).toContain("NCM ausente: X");
  });
});
