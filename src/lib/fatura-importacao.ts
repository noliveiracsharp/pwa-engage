import { serieParcelas, vencParcela1De, type ParcelaSerie } from "./financeiro";

/** Linha lida do PDF da fatura. */
export type ItemFaturaLido = {
  final4: string | null;
  data: string | null;
  descricao: string;
  valor: number;
  parcela: number | null;
  de: number | null;
  credito: boolean;
};

/** Descrição limpa: tira "(Parcela 02 de 10)" e espaços repetidos. */
export function limparDescricao(d: string): string {
  return d.replace(/\(?\s*parcela\s+\d+\s+de\s+\d+\s*\)?/i, "").replace(/\s+/g, " ").trim();
}

/** Lança só o que é despesa: pagamentos/estornos (créditos) e valores zerados ficam de fora. */
export function ehDespesa(i: ItemFaturaLido): boolean {
  if (i.credito || !(i.valor > 0)) return false;
  return !/^pagamento\b|pagto|estorno/i.test(i.descricao.trim());
}

/**
 * Parcelas de uma linha da fatura: a parcela atual cai SEMPRE no vencimento da fatura importada;
 * as anteriores voltam mês a mês (marcadas `anterior`) e as seguintes avançam.
 */
export function parcelasDaLinha(i: ItemFaturaLido, vencFatura: string, incluirAnteriores: boolean): ParcelaSerie[] {
  const total = Math.max(1, Math.floor(i.de ?? 1) || 1);
  const atual = Math.min(total, Math.max(1, Math.floor(i.parcela ?? 1) || 1));
  return serieParcelas({ total, inicio: atual, valorParcela: i.valor, incluirAnteriores, vencParcela1: vencParcela1De(vencFatura, atual) });
}

/** Chave para reconhecer uma compra já lançada na mesma fatura. */
export const chaveItem = (descricao: string, valor: number, parcela: number) =>
  `${limparDescricao(descricao).toLowerCase()}|${valor.toFixed(2)}|${parcela}`;
