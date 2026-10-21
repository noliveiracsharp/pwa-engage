import { num } from "@/lib/orcamentos";
import { saldoTitulo, situacaoTitulo } from "@/lib/financeiro";
import { temperaturaEfetiva } from "@/lib/temperatura";
import type { Row } from "@/lib/row";

/** Indicadores do Painel do Board — regras puras, sem acesso a banco. */
const r2 = (v: number) => Math.round(v * 100) / 100;
const iso = (v: unknown) => String(v ?? "").slice(0, 10);
const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const ativo = (t: Row) => String(t["status"] ?? "") !== "cancelado";

export const FAIXAS_AGING = ["A vencer", "1–15 dias", "16–30 dias", "31–60 dias", "60+ dias"] as const;

/** Distribui o saldo em aberto a receber por faixa de atraso. */
export function agingReceber(titulos: Row[], hoje: string) {
  const out = FAIXAS_AGING.map((faixa) => ({ faixa, valor: 0, qtd: 0 }));
  for (const t of titulos) {
    if (t["tipo"] !== "receber" || !ativo(t) || t["status"] === "pago") continue;
    const saldo = saldoTitulo(t);
    if (saldo <= 0) continue;
    const atraso = dias(iso(t["vencimento"]), hoje);
    const i = atraso <= 0 ? 0 : atraso <= 15 ? 1 : atraso <= 30 ? 2 : atraso <= 60 ? 3 : 4;
    out[i]!.valor = r2(out[i]!.valor + saldo);
    out[i]!.qtd++;
  }
  return out;
}

/** % do saldo a receber vencido há mais de 30 dias sobre todo o saldo a receber em aberto. */
export function inadimplencia(titulos: Row[], hoje: string): number {
  const a = agingReceber(titulos, hoje);
  const total = a.reduce((s, x) => s + x.valor, 0);
  const vencido30 = a[3]!.valor + a[4]!.valor;
  return total > 0 ? r2((vencido30 / total) * 100) : 0;
}

/** Prazo médio (dias) entre o lançamento e o pagamento, ponderado pelo valor pago. */
export function prazoMedio(titulos: Row[], tipo: "receber" | "pagar", desde: string, ate: string): number {
  let peso = 0;
  let soma = 0;
  for (const t of titulos) {
    if (t["tipo"] !== tipo || t["status"] !== "pago") continue;
    const pago = iso(t["pago_em"]);
    const inicio = iso(t["data_emissao"]) || iso(t["created_at"]);
    if (!pago || !inicio || pago < desde || pago > ate) continue;
    const v = num(t["valor_pago"]) || num(t["valor"]);
    soma += Math.max(0, dias(inicio, pago)) * v;
    peso += v;
  }
  return peso > 0 ? Math.round(soma / peso) : 0;
}

/** Ranking dos maiores parceiros (pagador ou fornecedor) por valor lançado no período. */
export function concentracao(titulos: Row[], tipo: "receber" | "pagar", desde: string, ate: string, top = 10) {
  const mapa = new Map<string, number>();
  let total = 0;
  for (const t of titulos) {
    if (t["tipo"] !== tipo || !ativo(t)) continue;
    const v = iso(t["vencimento"]);
    if (v < desde || v > ate) continue;
    const id = String(t["parceiro_id"] ?? "") || "—";
    const valor = num(t["valor"]);
    mapa.set(id, (mapa.get(id) ?? 0) + valor);
    total += valor;
  }
  const lista = [...mapa.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
  let acum = 0;
  return lista.map(([id, valor]) => {
    acum += valor;
    return { id, valor: r2(valor), pct: total ? r2((valor / total) * 100) : 0, acumulado: total ? r2((acum / total) * 100) : 0 };
  });
}

/** Meses AAAA-MM de `inicio` até `fim`, inclusive. */
export function mesesEntre(inicio: string, fim: string): string[] {
  const out: string[] = [];
  let [y, m] = inicio.slice(0, 7).split("-").map(Number) as [number, number];
  const lim = fim.slice(0, 7);
  while (`${y}-${String(m).padStart(2, "0")}` <= lim && out.length < 60) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** Evolução mês a mês: previsto (por vencimento) e realizado (por data de pagamento). */
export function evolucaoMensal(titulos: Row[], meses: string[]) {
  const base = new Map(meses.map((m) => [m, { mes: m, receberPrevisto: 0, receberRealizado: 0, pagarPrevisto: 0, pagarRealizado: 0 }]));
  for (const t of titulos) {
    if (!ativo(t)) continue;
    const rec = t["tipo"] === "receber";
    const prev = base.get(iso(t["vencimento"]).slice(0, 7));
    if (prev) {
      if (rec) prev.receberPrevisto += num(t["valor"]);
      else prev.pagarPrevisto += num(t["valor"]);
    }
    const pagoV = num(t["valor_pago"]) || (t["status"] === "pago" ? num(t["valor"]) : 0);
    const real = pagoV > 0 ? base.get(iso(t["pago_em"]).slice(0, 7)) : undefined;
    if (real) {
      if (rec) real.receberRealizado += pagoV;
      else real.pagarRealizado += pagoV;
    }
  }
  return [...base.values()].map((x) => ({
    ...x,
    receberPrevisto: r2(x.receberPrevisto), receberRealizado: r2(x.receberRealizado),
    pagarPrevisto: r2(x.pagarPrevisto), pagarRealizado: r2(x.pagarRealizado),
    resultado: r2(x.receberRealizado - x.pagarRealizado),
  }));
}

/** Despesas pagas no período agrupadas por categoria (maior primeiro). */
export function despesasPorCategoria(titulos: Row[], desde: string, ate: string) {
  const mapa = new Map<string, number>();
  for (const t of titulos) {
    if (t["tipo"] !== "pagar" || !ativo(t)) continue;
    const pago = num(t["valor_pago"]) || (t["status"] === "pago" ? num(t["valor"]) : 0);
    const d = iso(t["pago_em"]);
    if (!pago || d < desde || d > ate) continue;
    const c = String(t["categoria"] ?? "") || "Sem categoria";
    mapa.set(c, (mapa.get(c) ?? 0) + pago);
  }
  return [...mapa.entries()].map(([categoria, valor]) => ({ categoria, valor: r2(valor) })).sort((a, b) => b.valor - a.valor);
}

export type GrupoTemp = { label: string; qtd: number; implantacao: number; mensal: number };

/** Pipeline de Ofertas por temperatura (Ganho/Perdido têm prioridade sobre Frio/Morno/Quente). */
export function pipelinePorTemperatura(orcs: Row[], etapaDe: (o: Row) => string = () => "") {
  const mapa = new Map<string, GrupoTemp>();
  for (const o of orcs) {
    const t = temperaturaEfetiva(o["situacao"], o["temperatura"], etapaDe(o));
    const label = t?.label ?? "Sem temperatura";
    const g = mapa.get(label) ?? { label, qtd: 0, implantacao: 0, mensal: 0 };
    g.qtd++;
    g.implantacao = r2(g.implantacao + num(o["total_liquido"]));
    g.mensal = r2(g.mensal + num(o["total_recorrente"]));
    mapa.set(label, g);
  }
  return [...mapa.values()];
}

/** Taxa de conversão = ganhas / (ganhas + perdidas). */
export function taxaConversao(ganhas: number, perdidas: number): number {
  return ganhas + perdidas > 0 ? r2((ganhas / (ganhas + perdidas)) * 100) : 0;
}

/** Saving por cotação: (maior preço − preço escolhido, ou menor) × quantidade, por item. */
export function savingCotacoes(itens: Row[], precos: Row[]) {
  let maior = 0;
  let fechado = 0;
  for (const it of itens) {
    const qtd = num(it["quantidade"]) || 1;
    const ps = precos.filter((p) => String(p["cotacao_item_id"]) === String(it["id"]) && num(p["preco_unitario"]) > 0);
    if (ps.length < 2) continue;
    const valores = ps.map((p) => num(p["preco_unitario"]));
    const escolhido = ps.find((p) => String(p["fornecedor_id"]) === String(it["fornecedor_escolhido_id"] ?? ""));
    maior += Math.max(...valores) * qtd;
    fechado += (escolhido ? num(escolhido["preco_unitario"]) : Math.min(...valores)) * qtd;
  }
  const valor = r2(maior - fechado);
  return { valor, pct: maior > 0 ? r2((valor / maior) * 100) : 0, base: r2(maior) };
}

/** Semáforo genérico: menor é melhor quando `inverso`. */
export function farol(valor: number, bom: number, ruim: number, inverso = false): "verde" | "amarelo" | "vermelho" {
  if (inverso) return valor <= bom ? "verde" : valor <= ruim ? "amarelo" : "vermelho";
  return valor >= bom ? "verde" : valor >= ruim ? "amarelo" : "vermelho";
}

export { situacaoTitulo };
