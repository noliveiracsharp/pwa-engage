import { addMonthsISO, categoriaDespesaLabel, condicaoCompraFromValue, cronogramaCompra, despesasFromValue, num, parcelasFromValue, round2, type Parcela } from "@/lib/orcamentos";

export type ModoLancamento = "unico" | "parcelado" | "recorrente";

/** Lançamento manual: único, valor total dividido em N parcelas mensais, ou valor mensal repetido por N meses. */
export function parcelasManuais(opts: { modo: ModoLancamento; valor: number; quantidade: number; primeira: string }): { vencimento: string; valor: number }[] {
  const v = round2(Math.max(0, num(opts.valor)));
  if (v <= 0) return [];
  const n = opts.modo === "unico" ? 1 : Math.max(1, Math.min(120, Math.floor(num(opts.quantidade)) || 1));
  if (opts.modo !== "parcelado") return Array.from({ length: n }, (_, i) => ({ vencimento: addMonthsISO(opts.primeira, i), valor: v }));
  const base = Math.floor((v / n) * 100) / 100;
  return Array.from({ length: n }, (_, i) => ({
    vencimento: addMonthsISO(opts.primeira, i),
    valor: i === n - 1 ? round2(v - base * (n - 1)) : base,
  }));
}
import type { Row } from "@/lib/row";

export type TipoTitulo = "receber" | "pagar";
export type StatusTitulo = "aberto" | "pago" | "cancelado";
export type Situacao = "aberto" | "atrasado" | "pago" | "cancelado";
export type OrigemTitulo = "manual" | "oferta" | "pedido" | "despesa" | "comissao" | "reembolso";

export type NovoTitulo = {
  tipo: TipoTitulo;
  descricao: string;
  categoria: string;
  vencimento: string;
  valor: number;
  parceiro_id: string | null;
  origem_tipo: OrigemTitulo;
  origem_id: string | null;
  parcela_n: number;
};

export const CATEGORIAS_FINANCEIRO: Record<TipoTitulo, string[]> = {
  receber: ["Venda / Oferta", "Mensalidade", "Serviço avulso", "Outras receitas"],
  pagar: ["Fornecedores", "Despesas operacionais", "Comissões", "Reembolsos", "Impostos", "Folha", "Aluguel", "Energia / Água / Internet", "Outras despesas"],
};

export const FORMAS_PAGAMENTO = ["Pix", "Boleto", "Cartão de crédito", "Cartão de débito", "Transferência", "Dinheiro", "Cheque"];

export const hojeISO = () => new Date().toISOString().slice(0, 10);
const iso = (v: unknown) => String(v ?? "").slice(0, 10);

/** Situação exibida: aberto vencido antes de hoje vira "atrasado". */
export function situacaoTitulo(t: Row, hoje = hojeISO()): Situacao {
  const s = String(t["status"] ?? "aberto");
  if (s === "pago" || s === "cancelado") return s;
  const v = iso(t["vencimento"]);
  return v && v < hoje ? "atrasado" : "aberto";
}

export const SITUACAO_META: Record<Situacao, { label: (tipo: TipoTitulo) => string; badge: string }> = {
  aberto: { label: () => "Em aberto", badge: "bg-muted text-foreground" },
  atrasado: { label: () => "Atrasado", badge: "bg-destructive text-destructive-foreground" },
  pago: { label: (t) => (t === "receber" ? "Recebido" : "Pago"), badge: "bg-success text-success-foreground" },
  cancelado: { label: () => "Cancelado", badge: "bg-muted text-muted-foreground line-through" },
};

/** Valor efetivamente pago na baixa: principal + juros − desconto. */
export const valorBaixa = (valor: number, juros: number, desconto: number) =>
  round2(Math.max(0, num(valor) + num(juros) - num(desconto)));

/** Títulos de uma Oferta: parcelas do cliente (a receber) e despesas operacionais (a pagar). */
export function titulosDaOferta(orc: Row): NovoTitulo[] {
  const id = String(orc["id"] ?? "");
  const numero = String(orc["numero"] ?? "");
  const cliente = (orc["parceiro_id"] ?? orc["parceiros_id"] ?? null) as string | null;
  let parcelas = parcelasFromValue(orc["parcelas"]);
  if (!parcelas.length && num(orc["total_liquido"]) > 0)
    parcelas = [{ numero: 1, vencimento: iso(orc["data"] ?? orc["created_at"]) || hojeISO(), valor: num(orc["total_liquido"]) }];
  const total = parcelas.length;
  const out: NovoTitulo[] = parcelas.map((p) => ({
    tipo: "receber",
    descricao: `Oferta ${numero} — parcela ${p.numero}/${total}`,
    categoria: "Venda / Oferta",
    vencimento: p.vencimento || hojeISO(),
    valor: round2(p.valor),
    parceiro_id: cliente,
    origem_tipo: "oferta",
    origem_id: id,
    parcela_n: p.numero,
  }));
  const forn = cronogramaCompra({
    custo: num(orc["total_custo"]),
    condicao: condicaoCompraFromValue(orc["compra_condicao"]),
    parcelasCliente: parcelas,
    dataPadrao: iso(orc["dt_orcamento"] ?? orc["created_at"]) || hojeISO(),
  });
  forn.forEach((p, i) => {
    if (round2(p.valor) <= 0) return;
    out.push({
      tipo: "pagar",
      descricao: `Oferta ${numero} — Produtos / Fornecedor (${i + 1}/${forn.length})`,
      categoria: "Fornecedores",
      vencimento: p.vencimento || hojeISO(),
      valor: round2(p.valor),
      parceiro_id: null,
      origem_tipo: "oferta",
      origem_id: id,
      parcela_n: i + 1,
    });
  });
  const vencDesp = parcelas[0]?.vencimento || hojeISO();
  despesasFromValue(orc["despesas_operacionais"]).forEach((d, i) => {
    const v = round2(Math.max(0, num(d.valor)));
    if (v <= 0) return;
    out.push({
      tipo: "pagar",
      descricao: `Oferta ${numero} — ${d.descricao || categoriaDespesaLabel(d.categoria)}`,
      categoria: "Despesas operacionais",
      vencimento: vencDesp,
      valor: v,
      parceiro_id: null,
      origem_tipo: "despesa",
      origem_id: id,
      parcela_n: i + 1,
    });
  });
  return out;
}

/**
 * Títulos a pagar de um pedido: segue o cronograma de pagamento ao fornecedor da Oferta,
 * proporcional ao total do pedido (centavos ajustados na última parcela).
 */
export function titulosDoPedido(opts: {
  pedidoId: string;
  numero: string;
  fornecedorId: string;
  total: number;
  cronograma: Parcela[];
  hoje?: string;
}): NovoTitulo[] {
  const total = round2(opts.total);
  if (total <= 0) return [];
  const soma = opts.cronograma.reduce((s, p) => s + num(p.valor), 0);
  const base = soma > 0 ? opts.cronograma : [{ numero: 1, vencimento: opts.hoje ?? hojeISO(), valor: 1 }];
  const somaBase = soma > 0 ? soma : 1;
  let acumulado = 0;
  return base.map((p, i) => {
    const ultimo = i === base.length - 1;
    const valor = ultimo ? round2(total - acumulado) : round2((num(p.valor) / somaBase) * total);
    acumulado = round2(acumulado + valor);
    return {
      tipo: "pagar" as const,
      descricao: `Pedido ${opts.numero} — parcela ${i + 1}/${base.length}`,
      categoria: "Fornecedores",
      vencimento: p.vencimento || opts.hoje || hojeISO(),
      valor,
      parceiro_id: opts.fornecedorId,
      origem_tipo: "pedido" as const,
      origem_id: opts.pedidoId,
      parcela_n: i + 1,
    };
  });
}

export type ResumoTitulos = { aVencer: number; vencidos: number; pagoMes: number; emAberto: number };

/** Cards do topo: em aberto a vencer, vencidos, baixados no mês corrente e total em aberto. */
export function resumoTitulos(titulos: Row[], hoje = hojeISO()): ResumoTitulos {
  const mes = hoje.slice(0, 7);
  const r = { aVencer: 0, vencidos: 0, pagoMes: 0, emAberto: 0 };
  for (const t of titulos) {
    const s = situacaoTitulo(t, hoje);
    const v = num(t["valor"]);
    if (s === "aberto") { r.aVencer += v; r.emAberto += v; }
    else if (s === "atrasado") { r.vencidos += v; r.emAberto += v; }
    else if (s === "pago" && iso(t["pago_em"]).slice(0, 7) === mes) r.pagoMes += num(t["valor_pago"]) || v;
  }
  return { aVencer: round2(r.aVencer), vencidos: round2(r.vencidos), pagoMes: round2(r.pagoMes), emAberto: round2(r.emAberto) };
}

export type MesCaixa = { mes: string; entradas: number; saidas: number; entradasPrev: number; saidasPrev: number };

/** Realizado (baixas por data de pagamento) e previsto (em aberto por vencimento) mês a mês. */
export function caixaPorMes(titulos: Row[]): MesCaixa[] {
  const m = new Map<string, MesCaixa>();
  const get = (k: string) => {
    let x = m.get(k);
    if (!x) { x = { mes: k, entradas: 0, saidas: 0, entradasPrev: 0, saidasPrev: 0 }; m.set(k, x); }
    return x;
  };
  for (const t of titulos) {
    const st = String(t["status"] ?? "aberto");
    if (st === "cancelado") continue;
    const receber = t["tipo"] === "receber";
    if (st === "pago") {
      const k = iso(t["pago_em"]).slice(0, 7);
      if (!k) continue;
      const v = num(t["valor_pago"]) || num(t["valor"]);
      if (receber) get(k).entradas += v; else get(k).saidas += v;
    } else {
      const k = iso(t["vencimento"]).slice(0, 7);
      if (!k) continue;
      if (receber) get(k).entradasPrev += num(t["valor"]); else get(k).saidasPrev += num(t["valor"]);
    }
  }
  return [...m.values()]
    .map((x) => ({ ...x, entradas: round2(x.entradas), saidas: round2(x.saidas), entradasPrev: round2(x.entradasPrev), saidasPrev: round2(x.saidasPrev) }))
    .sort((a, b) => a.mes.localeCompare(b.mes));
}

const isoDe = (y: number, m0: number, d: number) => {
  const a = new Date(y, m0, 1);
  const ultimo = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate();
  return `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
};

/** Vencimento da fatura que recebe uma compra: compra no dia do fechamento ou depois vai para a fatura seguinte. */
export function vencimentoFatura(dataCompra: string, diaFechamento: number, diaVencimento: number): string {
  const [y, m, d] = dataCompra.split("-").map(Number);
  if (!y || !m || !d) return dataCompra;
  const f = Math.min(31, Math.max(1, Math.floor(diaFechamento) || 1));
  const v = Math.min(31, Math.max(1, Math.floor(diaVencimento) || 1));
  const mesFechamento = m - 1 + (d >= f ? 1 : 0);
  return isoDe(y, mesFechamento + (v > f ? 0 : 1), v);
}

/** Compra parcelada no cartão: cada parcela vence numa fatura; centavos de sobra ficam na 1ª parcela. */
export function parcelasCartao(opts: { valor: number; parcelas: number; dataCompra: string; diaFechamento: number; diaVencimento: number }): { vencimento: string; valor: number }[] {
  const v = round2(Math.max(0, num(opts.valor)));
  if (v <= 0) return [];
  const n = Math.max(1, Math.min(48, Math.floor(num(opts.parcelas)) || 1));
  const primeira = vencimentoFatura(opts.dataCompra, opts.diaFechamento, opts.diaVencimento);
  const base = Math.floor((v / n) * 100) / 100;
  const [y, m] = primeira.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => ({
    vencimento: isoDe(y!, m! - 1 + i, Math.floor(opts.diaVencimento) || 1),
    valor: i === 0 ? round2(v - base * (n - 1)) : base,
  }));
}
