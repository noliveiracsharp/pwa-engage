import { pick, type Row } from "@/lib/row";

export type TipoMov = {
  value: string;
  label: string;
  origem: boolean;
  destino: boolean;
  sinal: "entrada" | "saida" | "neutro";
};

/** Tipos de movimentação: definem quais locais são exigidos. */
export const TIPOS_MOV: TipoMov[] = [
  { value: "entrada_compra", label: "Entrada por compra", origem: false, destino: true, sinal: "entrada" },
  { value: "entrada_avulsa", label: "Entrada avulsa", origem: false, destino: true, sinal: "entrada" },
  { value: "devolucao", label: "Devolução", origem: false, destino: true, sinal: "entrada" },
  { value: "ajuste_entrada", label: "Ajuste de inventário (+)", origem: false, destino: true, sinal: "entrada" },
  { value: "saida_venda", label: "Saída por venda", origem: true, destino: false, sinal: "saida" },
  { value: "saida_avulsa", label: "Saída avulsa / consumo", origem: true, destino: false, sinal: "saida" },
  { value: "perda", label: "Perda / avaria", origem: true, destino: false, sinal: "saida" },
  { value: "ajuste_saida", label: "Ajuste de inventário (−)", origem: true, destino: false, sinal: "saida" },
  { value: "transferencia", label: "Transferência", origem: true, destino: true, sinal: "neutro" },
  { value: "remessa_comodato", label: "Remessa em comodato", origem: true, destino: true, sinal: "neutro" },
];

export const tipoMov = (v: unknown) => TIPOS_MOV.find((t) => t.value === String(v ?? ""));

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** Saldo por item → local, calculado a partir do Kardex. */
export function calcularSaldos(movs: Row[]) {
  const map = new Map<string, Map<string, number>>();
  const add = (item: string, local: string, q: number) => {
    const m = map.get(item) ?? new Map<string, number>();
    m.set(local, (m.get(local) ?? 0) + q);
    map.set(item, m);
  };
  for (const m of movs) {
    const item = String(pick(m, ["item_id"]) ?? "");
    const q = n(m["quantidade"]);
    if (!item) continue;
    if (m["local_destino_id"]) add(item, String(m["local_destino_id"]), q);
    if (m["local_origem_id"]) add(item, String(m["local_origem_id"]), -q);
  }
  return map;
}

export const qtd = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export type EntradaPedido = { item_id: string; quantidade: number; custo_unitario: number | null };

/** Entradas de estoque ao receber um pedido de compra: só itens que controlam estoque, somando linhas repetidas. */
export function entradasDoPedido(itens: Row[], controlaEstoque: Set<string>): EntradaPedido[] {
  const mapa = new Map<string, EntradaPedido & { valor: number }>();
  for (const it of itens) {
    const item = String(it["item_id"] ?? "");
    const q = n(it["quantidade"]);
    if (!item || !controlaEstoque.has(item) || !(q > 0)) continue;
    const valor = n(it["preco_unitario"]) * q;
    const atual = mapa.get(item);
    if (atual) { atual.quantidade += q; atual.valor += valor; }
    else mapa.set(item, { item_id: item, quantidade: q, custo_unitario: null, valor });
  }
  return [...mapa.values()].map(({ valor, ...e }) => ({ ...e, custo_unitario: valor > 0 ? Math.round((valor / e.quantidade) * 100) / 100 : null }));
}
