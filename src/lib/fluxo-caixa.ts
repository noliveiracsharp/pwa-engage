import {
  addMonthsISO,
  condicaoCompraFromValue,
  cronogramaCompra,
  parcelasFromValue,
  toISODate,
  type Parcela,
} from "@/lib/orcamentos";
import type { DreLinha } from "@/lib/dre-ofertas";
import type { Row } from "@/lib/row";

/** Um mês do fluxo de caixa projetado (chave AAAA-MM). */
export type MesCaixa = {
  mes: string;
  entradas: number;
  fornecedores: number;
  impostos: number;
  comissoes: number;
  despesas: number;
  saidas: number;
  saldo: number;
  acumulado: number;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const mesDe = (iso: string) => iso.slice(0, 7);

/** Rateia `total` nas datas das parcelas do cliente, na proporção de cada uma. */
function ratear(total: number, parcelas: Parcela[], deslocMeses = 0): Array<[string, number]> {
  const soma = parcelas.reduce((s, p) => s + Math.max(0, p.valor), 0);
  if (total <= 0 || soma <= 0) return [];
  return parcelas.map((p) => [mesDe(addMonthsISO(p.vencimento, deslocMeses)), (total * Math.max(0, p.valor)) / soma]);
}

/**
 * Lançamentos de caixa de uma Oferta:
 *  - entradas: parcelas do cliente no vencimento;
 *  - fornecedores: cronograma gravado (ou recalculado pela condição de compra);
 *  - impostos: proporcionais ao recebido, pagos no mês seguinte;
 *  - comissões: proporcionais ao recebido, no mesmo mês;
 *  - despesas operacionais: no mês da 1ª parcela (início da execução).
 */
export function lancamentosOferta(orc: Row, l: DreLinha) {
  const dataBase = toISODate(orc["dt_orcamento"]) || new Date().toISOString().slice(0, 10);
  let cli = parcelasFromValue(orc["parcelas"]).filter((p) => p.vencimento);
  if (!cli.length && l.liquido > 0) cli = [{ numero: 1, vencimento: dataBase, valor: l.liquido }];
  // Serviços avulsos com cronograma próprio também entram como recebimento.
  const serv = parcelasFromValue(orc["parcelas_servicos"]).filter((p) => p.vencimento);
  let forn = parcelasFromValue(orc["compra_parcelas"]).filter((p) => p.vencimento);
  if (!forn.length) {
    forn = cronogramaCompra({ custo: l.custo, condicao: condicaoCompraFromValue(orc["compra_condicao"]), parcelasCliente: cli, dataPadrao: dataBase });
  }
  const out: Array<{ mes: string; k: "entradas" | "fornecedores" | "impostos" | "comissoes" | "despesas"; v: number }> = [];
  for (const p of [...cli, ...serv]) out.push({ mes: mesDe(p.vencimento), k: "entradas", v: p.valor });
  for (const p of forn) out.push({ mes: mesDe(p.vencimento), k: "fornecedores", v: p.valor });
  for (const [mes, v] of ratear(l.imposto, cli, 1)) out.push({ mes, k: "impostos", v });
  for (const [mes, v] of ratear(l.comissoes, cli)) out.push({ mes, k: "comissoes", v });
  if (l.despesas > 0) out.push({ mes: mesDe(cli[0]?.vencimento ?? dataBase), k: "despesas", v: l.despesas });
  return out;
}

/** Consolida mês a mês (meses contínuos, sem buracos) com saldo e acumulado. */
export function fluxoCaixaMensal(ofertas: Array<{ o: Row; l: DreLinha }>): MesCaixa[] {
  const mapa = new Map<string, MesCaixa>();
  const novo = (mes: string): MesCaixa => ({ mes, entradas: 0, fornecedores: 0, impostos: 0, comissoes: 0, despesas: 0, saidas: 0, saldo: 0, acumulado: 0 });
  for (const { o, l } of ofertas) {
    for (const x of lancamentosOferta(o, l)) {
      const m = mapa.get(x.mes) ?? novo(x.mes);
      m[x.k] += x.v;
      mapa.set(x.mes, m);
    }
  }
  const chaves = [...mapa.keys()].sort();
  if (!chaves.length) return [];
  const meses: MesCaixa[] = [];
  let cur = `${chaves[0]}-01`;
  const fim = chaves[chaves.length - 1]!;
  let acc = 0;
  while (mesDe(cur) <= fim) {
    const m = mapa.get(mesDe(cur)) ?? novo(mesDe(cur));
    for (const k of ["entradas", "fornecedores", "impostos", "comissoes", "despesas"] as const) m[k] = r2(m[k]);
    m.saidas = r2(m.fornecedores + m.impostos + m.comissoes + m.despesas);
    m.saldo = r2(m.entradas - m.saidas);
    acc = r2(acc + m.saldo);
    m.acumulado = acc;
    meses.push(m);
    cur = addMonthsISO(cur, 1);
  }
  return meses;
}

const NOMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export const rotuloMes = (mes: string) => `${NOMES[Number(mes.slice(5, 7)) - 1] ?? "?"}/${mes.slice(2, 4)}`;
