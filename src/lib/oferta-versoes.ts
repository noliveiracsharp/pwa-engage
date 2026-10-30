import { textoDetalhe } from "@/lib/orcamentos";
/** Regras puras do versionamento de Ofertas (revisões congeladas). */
export type ItemSnap = { item_id?: string | null; detalhe?: string | null; quantidade?: number | string | null; valor_unitario?: number | string | null; total_linha?: number | string | null; natureza?: string | null };
export type Snapshot = { orcamento: Record<string, unknown>; itens: ItemSnap[] };

export type DiffItem = { chave: string; nome: string; tipo: "adicionado" | "removido" | "alterado"; antes?: ItemSnap; depois?: ItemSnap };
export type DiffCampo = { campo: string; rotulo: string; antes: number; depois: number; delta: number };

const num = (v: unknown) => Number(v ?? 0) || 0;
const chaveItem = (i: ItemSnap) => `${i.item_id ?? ""}|${textoDetalhe(i.detalhe).toLowerCase()}`;

export const CAMPOS_COMPARADOS: Array<[string, string]> = [
  ["total_itens", "Total dos itens"],
  ["desconto_valor", "Desconto"],
  ["total_liquido", "Implantação / total"],
  ["total_recorrente", "Mensalidade"],
  ["total_custo", "Custo"],
  ["total_lucro", "Lucro"],
  ["margem_pct", "Margem %"],
];

/** Compara duas revisões: itens adicionados/removidos/alterados e variação dos totais. */
export function compararVersoes(antes: Snapshot, depois: Snapshot, nomeItem: (id: string) => string = (id) => id) {
  const mapA = new Map(antes.itens.map((i) => [chaveItem(i), i]));
  const mapD = new Map(depois.itens.map((i) => [chaveItem(i), i]));
  const nome = (i: ItemSnap) => String(textoDetalhe(i.detalhe) || (i.item_id ? nomeItem(String(i.item_id)) : "") || "Item");
  const itens: DiffItem[] = [];
  for (const [k, d] of mapD) {
    const a = mapA.get(k);
    if (!a) itens.push({ chave: k, nome: nome(d), tipo: "adicionado", depois: d });
    else if (num(a.quantidade) !== num(d.quantidade) || num(a.valor_unitario) !== num(d.valor_unitario))
      itens.push({ chave: k, nome: nome(d), tipo: "alterado", antes: a, depois: d });
  }
  for (const [k, a] of mapA) if (!mapD.has(k)) itens.push({ chave: k, nome: nome(a), tipo: "removido", antes: a });
  const campos: DiffCampo[] = CAMPOS_COMPARADOS.map(([campo, rotulo]) => {
    const x = num(antes.orcamento[campo]), y = num(depois.orcamento[campo]);
    return { campo, rotulo, antes: x, depois: y, delta: Math.round((y - x) * 100) / 100 };
  }).filter((c) => c.delta !== 0);
  return { itens, campos, igual: itens.length === 0 && campos.length === 0 };
}

/** Rótulo exibido para a revisão (Rev. 1, Rev. 2...). */
export const rotuloVersao = (v: unknown) => `Rev. ${Math.max(1, Math.trunc(num(v)) || 1)}`;
