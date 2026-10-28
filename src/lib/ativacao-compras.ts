/** Regras puras da geração de Pedidos de Compra na ativação da Oferta. */

type R = Record<string, unknown>;
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export type Vencedor = { fornecedorId: string; preco: number };

/**
 * Vencedor de cada item (por item_id) nas cotações de origem: escolha manual do comprador
 * ou, sem ela, o menor preço disponível. Permite vários vencedores, um por item/grupo.
 */
export function vencedoresPorItem(itensCot: R[], precos: R[]): Map<string, Vencedor> {
  const out = new Map<string, Vencedor>();
  for (const it of itensCot) {
    const itemId = String(it["item_id"] ?? "");
    if (!itemId) continue;
    const ofertas = precos
      .filter((p) => String(p["cotacao_item_id"]) === String(it["id"]) && p["disponivel"] !== false && n(p["preco_unitario"]) > 0)
      .map((p) => ({ fornecedorId: String(p["fornecedor_id"]), preco: n(p["preco_unitario"]) }));
    if (!ofertas.length) continue;
    const manual = String(it["fornecedor_escolhido_id"] ?? "");
    const v = ofertas.find((o) => o.fornecedorId === manual) ?? [...ofertas].sort((a, b) => a.preco - b.preco)[0]!;
    out.set(itemId, v);
  }
  return out;
}

export type LinhaCompra = { chave: string; itemId: string; descricao: string; qtd: number; custo: number; fornecedorId: string; grupo?: string | undefined };

/** Agrupa as linhas por fornecedor: cada fornecedor recebe um pedido só com os itens dele. Linhas sem fornecedor ficam em "". */
export function pedidosPorFornecedor(linhas: LinhaCompra[]): Map<string, { linhas: LinhaCompra[]; total: number }> {
  const m = new Map<string, { linhas: LinhaCompra[]; total: number }>();
  for (const l of linhas) {
    if (!(l.qtd > 0)) continue;
    const g = m.get(l.fornecedorId) ?? { linhas: [], total: 0 };
    g.linhas.push(l);
    g.total = Math.round((g.total + l.qtd * l.custo) * 100) / 100;
    m.set(l.fornecedorId, g);
  }
  return m;
}

/** Aplica um fornecedor a todas as linhas de um grupo (ex.: "Material elétrico" → Coreval). */
export function aplicarFornecedorAoGrupo(linhas: LinhaCompra[], grupo: string, fornecedorId: string): LinhaCompra[] {
  return linhas.map((l) => ((l.grupo ?? "") === grupo ? { ...l, fornecedorId } : l));
}
