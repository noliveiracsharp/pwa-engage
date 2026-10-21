/** Regras puras do versionamento de Cotações (revisões congeladas, como nas Ofertas). */
export type ItemCotSnap = { item_id: string; quantidade: number; unidade?: string | null };
export type PrecoSnap = { item_id: string; fornecedor_id: string; preco_unitario: number };
export type SnapCotacao = { itens: ItemCotSnap[]; precos: PrecoSnap[] };
export type DiffItemCot = { item_id: string; nome: string; tipo: "adicionado" | "removido" | "alterado"; antes?: number; depois?: number };

type R = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0) || 0;

/** Congela itens (por produto) e preços informados pelos fornecedores. */
export function snapshotCotacao(itensCot: R[], precos: R[]): SnapCotacao {
  const porCotItem = new Map(itensCot.map((i) => [String(i["id"]), String(i["item_id"] ?? i["id"])]));
  return {
    itens: itensCot.map((i) => ({ item_id: String(i["item_id"] ?? i["id"]), quantidade: num(i["quantidade"]), unidade: (i["unidade"] as string) ?? null })),
    precos: precos.filter((p) => num(p["preco_unitario"]) > 0).map((p) => ({
      item_id: porCotItem.get(String(p["cotacao_item_id"])) ?? String(p["cotacao_item_id"]),
      fornecedor_id: String(p["fornecedor_id"]), preco_unitario: num(p["preco_unitario"]),
    })),
  };
}

/** Itens incluídos, removidos ou com quantidade alterada entre duas revisões. */
export function compararCotacoes(antes: SnapCotacao, depois: SnapCotacao, nomeItem: (id: string) => string = (id) => id) {
  const a = new Map((antes?.itens ?? []).map((i) => [i.item_id, i]));
  const d = new Map((depois?.itens ?? []).map((i) => [i.item_id, i]));
  const itens: DiffItemCot[] = [];
  for (const [k, x] of d) {
    const y = a.get(k);
    if (!y) itens.push({ item_id: k, nome: nomeItem(k), tipo: "adicionado", depois: x.quantidade });
    else if (y.quantidade !== x.quantidade) itens.push({ item_id: k, nome: nomeItem(k), tipo: "alterado", antes: y.quantidade, depois: x.quantidade });
  }
  for (const [k, y] of a) if (!d.has(k)) itens.push({ item_id: k, nome: nomeItem(k), tipo: "removido", antes: y.quantidade });
  const chave = (p: PrecoSnap) => `${p.item_id}|${p.fornecedor_id}|${p.preco_unitario}`;
  const pa = new Set((antes?.precos ?? []).map(chave));
  const pd = new Set((depois?.precos ?? []).map(chave));
  const precosMudaram = pa.size !== pd.size || [...pd].some((k) => !pa.has(k));
  return { itens, precosMudaram, igual: itens.length === 0 && !precosMudaram };
}
