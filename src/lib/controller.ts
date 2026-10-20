/** Controller financeiro: indicadores e alertas determinísticos sobre financeiro_titulos (puro, testável). */
import type { Row } from "@/lib/row";
import { num, round2 } from "@/lib/orcamentos";
import { hojeISO, situacaoTitulo } from "@/lib/financeiro";

export type NivelAlerta = "critico" | "atencao" | "ok";
export type Alerta = { id: string; nivel: NivelAlerta; titulo: string; detalhe: string };

const iso = (v: unknown) => String(v ?? "").slice(0, 10);
const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const somaDias = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);
const mesMenos = (hoje: string, n: number) => {
  const d = new Date(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const pagoValor = (t: Row) => num(t["valor_pago"]) || num(t["valor"]);
const ativo = (t: Row) => String(t["status"] ?? "aberto") !== "cancelado";

/** Primeiro dia (em até `horizonte` dias) em que o saldo projetado fica negativo, com títulos em aberto por vencimento. */
export function rupturaCaixa(titulos: Row[], saldo: number, hoje = hojeISO(), horizonte = 90): { data: string; saldo: number } | null {
  const fim = somaDias(hoje, horizonte);
  const mov = new Map<string, number>();
  for (const t of titulos) {
    if (!ativo(t) || t["status"] === "pago") continue;
    // vencidos entram hoje
    const v = iso(t["vencimento"]);
    if (!v || v > fim) continue;
    const d = v < hoje ? hoje : v;
    mov.set(d, (mov.get(d) ?? 0) + (t["tipo"] === "receber" ? 1 : -1) * num(t["valor"]));
  }
  let s = saldo;
  for (const d of [...mov.keys()].sort()) {
    s += mov.get(d)!;
    if (s < 0) return { data: d, saldo: round2(s) };
  }
  return null;
}

/** Média mensal de saídas pagas nos últimos `meses` meses fechados. */
export function burnRate(titulos: Row[], hoje = hojeISO(), meses = 3): number {
  const alvo = new Set(Array.from({ length: meses }, (_, i) => mesMenos(hoje, i + 1)));
  let s = 0;
  for (const t of titulos) if (t["tipo"] === "pagar" && t["status"] === "pago" && alvo.has(iso(t["pago_em"]).slice(0, 7))) s += pagoValor(t);
  return round2(s / meses);
}

/** Fôlego em meses: saldo / burn rate (null quando não há despesas). */
export const runwayMeses = (saldo: number, burn: number) => (burn > 0 ? round2(Math.max(0, saldo) / burn) : null);

export type Devedor = { nome: string; valor: number };
/** Recebíveis vencidos: total e maiores devedores. */
export function inadimplencia(titulos: Row[], nomeDe: (t: Row) => string, hoje = hojeISO()) {
  const m = new Map<string, number>();
  let total = 0;
  for (const t of titulos) {
    if (t["tipo"] !== "receber" || situacaoTitulo(t, hoje) !== "atrasado") continue;
    const v = num(t["valor"]);
    total += v;
    const n = nomeDe(t) || "Sem cliente";
    m.set(n, (m.get(n) ?? 0) + v);
  }
  const top = [...m.entries()].map(([nome, valor]) => ({ nome, valor: round2(valor) })).sort((a, b) => b.valor - a.valor).slice(0, 3);
  return { total: round2(total), top };
}

/** Prazo médio (dias) entre competência/criação e pagamento, ponderado por valor. */
export function prazoMedio(titulos: Row[], tipo: "receber" | "pagar"): number | null {
  let pv = 0, sv = 0;
  for (const t of titulos) {
    if (t["tipo"] !== tipo || t["status"] !== "pago") continue;
    const ini = iso(t["data_competencia"]) || iso(t["created_at"]);
    const fim = iso(t["pago_em"]);
    if (!ini || !fim) continue;
    const v = pagoValor(t);
    pv += Math.max(0, dias(ini, fim)) * v;
    sv += v;
  }
  return sv > 0 ? Math.round(pv / sv) : null;
}

export type CategoriaDesvio = { categoria: string; atual: number; media: number; variacao: number };
/** Categorias de despesa do mês corrente acima da média dos 3 meses anteriores (+30%). */
export function categoriasEmAlta(titulos: Row[], hoje = hojeISO(), limite = 0.3): CategoriaDesvio[] {
  const mesAtual = hoje.slice(0, 7);
  const anteriores = new Set([1, 2, 3].map((i) => mesMenos(hoje, i)));
  const atual = new Map<string, number>(), hist = new Map<string, number>();
  for (const t of titulos) {
    if (t["tipo"] !== "pagar" || !ativo(t)) continue;
    const mes = (t["status"] === "pago" ? iso(t["pago_em"]) : iso(t["vencimento"])).slice(0, 7);
    const cat = String(t["categoria"] || "Sem categoria");
    const v = t["status"] === "pago" ? pagoValor(t) : num(t["valor"]);
    if (mes === mesAtual) atual.set(cat, (atual.get(cat) ?? 0) + v);
    else if (anteriores.has(mes) && t["status"] === "pago") hist.set(cat, (hist.get(cat) ?? 0) + v);
  }
  const out: CategoriaDesvio[] = [];
  for (const [categoria, a] of atual) {
    const media = (hist.get(categoria) ?? 0) / 3;
    if (media > 0 && a > media * (1 + limite)) out.push({ categoria, atual: round2(a), media: round2(media), variacao: round2(a / media - 1) });
  }
  return out.sort((x, y) => y.atual - y.media - (x.atual - x.media));
}

export type Diagnostico = {
  saldo: number;
  burn: number;
  runway: number | null;
  ruptura: { data: string; saldo: number } | null;
  inadimplencia: { total: number; top: Devedor[] };
  pmr: number | null;
  pmp: number | null;
  categorias: CategoriaDesvio[];
  aReceber30: number;
  aPagar30: number;
  alertas: Alerta[];
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (d: string) => d.split("-").reverse().join("/");

export function diagnosticar(titulos: Row[], saldo: number, nomeDe: (t: Row) => string, hoje = hojeISO()): Diagnostico {
  const burn = burnRate(titulos, hoje);
  const runway = runwayMeses(saldo, burn);
  const ruptura = rupturaCaixa(titulos, saldo, hoje);
  const inad = inadimplencia(titulos, nomeDe, hoje);
  const pmr = prazoMedio(titulos, "receber");
  const pmp = prazoMedio(titulos, "pagar");
  const categorias = categoriasEmAlta(titulos, hoje);
  const lim = somaDias(hoje, 30);
  let aReceber30 = 0, aPagar30 = 0;
  for (const t of titulos) {
    if (!ativo(t) || t["status"] === "pago") continue;
    const v = iso(t["vencimento"]);
    if (!v || v > lim) continue;
    if (t["tipo"] === "receber") aReceber30 += num(t["valor"]); else aPagar30 += num(t["valor"]);
  }
  const recebido90 = titulos.filter((t) => t["tipo"] === "receber" && t["status"] === "pago" && iso(t["pago_em"]) >= somaDias(hoje, -90)).reduce((a, t) => a + pagoValor(t), 0);

  const alertas: Alerta[] = [];
  if (ruptura) alertas.push({ id: "ruptura", nivel: "critico", titulo: "Risco de caixa negativo", detalhe: `Se os pagamentos previstos forem feitos sem novas entradas, o caixa fica em ${brl(ruptura.saldo)} em ${br(ruptura.data)}.` });
  if (runway !== null && runway < 3) alertas.push({ id: "runway", nivel: runway < 1 ? "critico" : "atencao", titulo: "Fôlego de caixa curto", detalhe: `O saldo cobre cerca de ${runway.toLocaleString("pt-BR")} mês(es) da média de despesas (${brl(burn)}/mês).` });
  if (inad.total > 0) {
    const pct = recebido90 > 0 ? inad.total / recebido90 : 1;
    alertas.push({ id: "inadimplencia", nivel: pct > 0.15 ? "critico" : "atencao", titulo: "Recebíveis vencidos", detalhe: `${brl(inad.total)} em atraso. Maiores: ${inad.top.map((d) => `${d.nome} (${brl(d.valor)})`).join(", ")}.` });
  }
  if (pmr !== null && pmp !== null && pmr > pmp + 5) alertas.push({ id: "prazos", nivel: "atencao", titulo: "Recebe depois de pagar", detalhe: `Você recebe em média em ${pmr} dias e paga em ${pmp} dias. Essa diferença consome capital de giro.` });
  for (const c of categorias.slice(0, 3)) alertas.push({ id: `cat-${c.categoria}`, nivel: "atencao", titulo: `Despesa em alta: ${c.categoria}`, detalhe: `${brl(c.atual)} neste mês, ${Math.round(c.variacao * 100)}% acima da média (${brl(c.media)}).` });
  if (aPagar30 > saldo + aReceber30) alertas.push({ id: "30d", nivel: "critico", titulo: "Próximos 30 dias descobertos", detalhe: `A pagar ${brl(aPagar30)} contra saldo + a receber de ${brl(saldo + aReceber30)}.` });
  if (!alertas.length) alertas.push({ id: "ok", nivel: "ok", titulo: "Caixa saudável", detalhe: "Nenhum risco relevante identificado nos próximos 90 dias." });

  return { saldo, burn, runway, ruptura, inadimplencia: inad, pmr, pmp, categorias, aReceber30: round2(aReceber30), aPagar30: round2(aPagar30), alertas };
}

export type MesProjetado = { mes: string; entradas: number; saidas: number; saldoFinal: number };
/** Projeção mês a mês do saldo usando títulos em aberto (vencidos entram no mês atual). */
export function projecaoMensal(titulos: Row[], saldo: number, hoje = hojeISO(), meses = 15): MesProjetado[] {
  const lista = Array.from({ length: meses }, (_, i) => mesMenos(hoje, -i));
  const mov = new Map(lista.map((m) => [m, { e: 0, s: 0 }]));
  for (const t of titulos) {
    if (!ativo(t) || t["status"] === "pago") continue;
    let m = iso(t["vencimento"]).slice(0, 7);
    if (!m) continue;
    if (m < lista[0]) m = lista[0];
    const x = mov.get(m);
    if (!x) continue;
    const v = t["status"] === "parcial" ? Math.max(0, num(t["valor"]) - num(t["valor_pago"])) : num(t["valor"]);
    if (t["tipo"] === "receber") x.e += v; else x.s += v;
  }
  let s = saldo;
  return lista.map((mes) => {
    const x = mov.get(mes)!;
    s += x.e - x.s;
    return { mes, entradas: round2(x.e), saidas: round2(x.s), saldoFinal: round2(s) };
  });
}
