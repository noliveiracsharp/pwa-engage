import { describe, expect, it } from "vitest";
import { aplicarFornecedorAoGrupo, pedidosPorFornecedor, vencedoresPorItem, type LinhaCompra } from "./ativacao-compras";

describe("ativação — pedidos de compra", () => {
  it("cada item pode ter um vencedor diferente; escolha manual vence o menor preço", () => {
    const itens = [
      { id: "c1", item_id: "cabo" },
      { id: "c2", item_id: "catraca", fornecedor_escolhido_id: "bj" },
    ];
    const precos = [
      { cotacao_item_id: "c1", fornecedor_id: "coreval", preco_unitario: 10 },
      { cotacao_item_id: "c1", fornecedor_id: "bj", preco_unitario: 12 },
      { cotacao_item_id: "c2", fornecedor_id: "coreval", preco_unitario: 900 },
      { cotacao_item_id: "c2", fornecedor_id: "bj", preco_unitario: 1000 },
    ];
    const v = vencedoresPorItem(itens, precos);
    expect(v.get("cabo")).toEqual({ fornecedorId: "coreval", preco: 10 });
    expect(v.get("catraca")).toEqual({ fornecedorId: "bj", preco: 1000 });
  });

  it("gera um pedido por fornecedor, só com os itens dele", () => {
    const l: LinhaCompra[] = [
      { chave: "1", itemId: "cabo", descricao: "Cabo", qtd: 100, custo: 2, fornecedorId: "coreval", grupo: "Elétrico" },
      { chave: "2", itemId: "disj", descricao: "Disjuntor", qtd: 2, custo: 30, fornecedorId: "", grupo: "Elétrico" },
      { chave: "3", itemId: "catraca", descricao: "Catraca", qtd: 1, custo: 1500, fornecedorId: "bj", grupo: "Acesso" },
    ];
    const agrupado = pedidosPorFornecedor(aplicarFornecedorAoGrupo(l, "Elétrico", "coreval"));
    expect([...agrupado.keys()].sort()).toEqual(["bj", "coreval"]);
    expect(agrupado.get("coreval")!.total).toBe(260);
    expect(agrupado.get("bj")!.linhas).toHaveLength(1);
  });
});
