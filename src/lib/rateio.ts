import { num, round2 } from "@/lib/orcamentos";
import type { NovoTitulo } from "@/lib/financeiro";

/** Linha de origem (item da Oferta ou do pedido) usada para ratear um título. */
export type FonteRateio = {
  item_id: string | null;
  descricao: string;
  quantidade: number;
  /** Peso no rateio: total da linha de venda (Oferta) ou de compra (pedido). */
  peso: number;
  centro_custo_id: string | null;
  plano_contas_id: string | null;
  /** Só Ofertas: itens recorrentes alimentam as mensalidades; os demais, a implantação. */
  recorrente?: boolean;
  /** Só Ofertas: item de produto (NF-e); os demais são serviços (NFS-e). */
  produto?: boolean;
  /** Só Ofertas: pagador do item quando diferente do cliente. */
  pagador?: string | null;
  origem_tipo: "oferta_item" | "pedido_item";
  origem_id: string | null;
};

export type LinhaRateio = {
  item_id: string | null;
  descricao: string;
  quantidade: number;
  valor: number;
  centro_custo_id: string | null;
  plano_contas_id: string | null;
  origem_tipo: "manual" | "oferta_item" | "pedido_item";
  origem_id: string | null;
};

/** Divide `valor` entre as fontes proporcionalmente ao peso; centavos fecham na última linha. */
export function ratearValor(valor: number, fontes: FonteRateio[]): LinhaRateio[] {
  const total = round2(valor);
  const validas = fontes.filter((f) => num(f.peso) > 0);
  const soma = validas.reduce((s, f) => s + num(f.peso), 0);
  if (total <= 0 || soma <= 0) return [];
  let acumulado = 0;
  return validas.map((f, i) => {
    const v = i === validas.length - 1 ? round2(total - acumulado) : round2((num(f.peso) / soma) * total);
    acumulado = round2(acumulado + v);
    return { item_id: f.item_id, descricao: f.descricao, quantidade: f.quantidade, valor: v,
      centro_custo_id: f.centro_custo_id, plano_contas_id: f.plano_contas_id, origem_tipo: f.origem_tipo, origem_id: f.origem_id };
  });
}

/**
 * Quais fontes compõem um título gerado automaticamente:
 * - Oferta a receber: mensalidade usa itens recorrentes, implantação os demais; filtra pelo pagador do título.
 * - Pedido de compra a pagar: todos os itens do pedido.
 * Demais títulos (despesas, fornecedor da Oferta) não recebem linhas.
 */
export function fontesDoTitulo(t: NovoTitulo, fontes: FonteRateio[], clienteId: string | null = null): FonteRateio[] {
  if (t.origem_tipo === "pedido" && t.tipo === "pagar") return fontes.filter((f) => f.origem_tipo === "pedido_item");
  if (t.origem_tipo !== "oferta" || t.tipo !== "receber") return [];
  const mensal = t.categoria === "Mensalidade de contrato";
  return fontes.filter((f) => f.origem_tipo === "oferta_item" && !!f.recorrente === mensal
    && (f.pagador || clienteId) === t.parceiro_id);
}

/** Linhas de rateio de um título (vazio quando nada se aplica). */
export function linhasDoTitulo(t: NovoTitulo, fontes: FonteRateio[], clienteId: string | null = null): LinhaRateio[] {
  return ratearValor(t.valor, fontesDoTitulo(t, fontes, clienteId));
}

/** Diferença entre o total do título e a soma das linhas (0 = fechado). */
export function diferencaRateio(valorTitulo: number, linhas: { valor: number }[]): number {
  return round2(round2(valorTitulo) - linhas.reduce((s, l) => s + num(l.valor), 0));
}

/** Valores de NF-e (produtos) e NFS-e (serviços) de um título gerado pela Oferta, a partir do rateio. */
export function valoresFiscaisDoTitulo(t: NovoTitulo, fontes: FonteRateio[], clienteId: string | null = null): { nfe_valor: number; nfse_valor: number } | null {
  const fs = fontesDoTitulo(t, fontes, clienteId).filter((f) => f.origem_tipo === "oferta_item");
  const linhas = ratearValor(t.valor, fs);
  if (!linhas.length) return null;
  const prod = new Set(fs.filter((f) => f.produto).map((f) => f.origem_id));
  const nfe = round2(linhas.filter((l) => prod.has(l.origem_id)).reduce((s, l) => s + l.valor, 0));
  return { nfe_valor: nfe, nfse_valor: round2(round2(t.valor) - nfe) };
}
