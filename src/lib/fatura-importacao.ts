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

const MESES: Record<string, string> = { jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06", jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12" };
const brl = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

/** Lê o texto (linha a linha) de uma fatura de cartão — sem IA. */
export function lerTextoFatura(texto: string): { vencimento: string | null; total: number | null; itens: ItemFaturaLido[] } {
  const linhas = texto.split(/\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  let vencimento: string | null = null;
  let total: number | null = null;
  const v = texto.match(/vencimento[^\d]{0,40}(\d{2})\/(\d{2})\/(\d{4})/i) ?? texto.match(/\d{4}\*{2,}\d{4} (\d{2})\/(\d{2})\/(\d{4})/);
  if (v) vencimento = `${v[3]}-${v[2]}-${v[1]}`;
  const t = texto.match(/(?:fatura atual|total da (?:sua )?fatura)[^\d]{0,30}R\$ ?([\d.]+,\d{2})/i);
  if (t) total = brl(t[1]);
  let final4: string | null = null;
  const itens: ItemFaturaLido[] = [];
  const re = /^(\d{1,2}) de ([a-zç]{3})\.? (\d{4}) (.+?)(?: -)? (\+ ?)?(-)?R\$ ?([\d.]+,\d{2})$/i;
  for (const l of linhas) {
    const c = l.match(/^cart[ãa]o \S*?(\d{4})$/i);
    if (c) { final4 = c[1]; continue; }
    const m = l.match(re);
    if (!m) continue;
    const mes = MESES[m[2].toLowerCase()];
    if (!mes) continue;
    const desc = m[4].replace(/\s+-$/, "").trim();
    const p = desc.match(/parcela\s+(\d+)\s+de\s+(\d+)/i);
    const credito = !!m[5] || /^p ?agamento\b|estorno/i.test(desc);
    itens.push({
      final4, data: `${m[3]}-${mes}-${m[1].padStart(2, "0")}`,
      descricao: desc.replace(/^P AGAMENTO/i, "PAGAMENTO"), valor: brl(m[7]),
      parcela: p ? Number(p[1]) : null, de: p ? Number(p[2]) : null, credito,
    });
  }
  return { vencimento, total, itens };
}
