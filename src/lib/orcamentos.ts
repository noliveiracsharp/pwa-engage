import { rowId } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";

/* ------------------------------------------------------------------ */
/* Situação                                                            */
/* ------------------------------------------------------------------ */

export type Situacao = "Em andamento" | "Aprovado" | "Reprovado";

export const SITUACOES: Array<{ value: Situacao; label: string; badge: string; dot: string }> = [
  {
    value: "Em andamento",
    label: "Em andamento",
    badge: "bg-warning text-warning-foreground",
    dot: "bg-warning",
  },
  {
    value: "Aprovado",
    label: "Aprovado",
    badge: "bg-success text-success-foreground",
    dot: "bg-success",
  },
  {
    value: "Reprovado",
    label: "Reprovado",
    badge: "bg-destructive text-destructive-foreground",
    dot: "bg-destructive",
  },
];

export function situacaoOf(value: unknown): Situacao {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  if (v.startsWith("aprov")) return "Aprovado";
  if (v.startsWith("reprov") || v.startsWith("rejeit")) return "Reprovado";
  return "Em andamento";
}

export function situacaoMeta(value: unknown) {
  const s = situacaoOf(value);
  return SITUACOES.find((o) => o.value === s) ?? SITUACOES[0]!;
}

export type DescontoTipo = "valor" | "percentual";

/* ------------------------------------------------------------------ */
/* Números e formatação                                                */
/* ------------------------------------------------------------------ */

/** Converte texto digitado (aceita "1.234,56", "12,5" ou "12.5") em número; inválido = 0. */
export function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const s = String(value ?? "").trim();
  if (!s) return 0;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export function formatBRL(value: unknown): string {
  const n = typeof value === "number" ? value : num(value);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatQtd(value: unknown): string {
  const n = typeof value === "number" ? value : num(value);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

export function formatPct(value: unknown): string {
  const n = typeof value === "number" ? value : num(value);
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
}

/* ------------------------------------------------------------------ */
/* Datas (ISO yyyy-mm-dd, sem fuso)                                    */
/* ------------------------------------------------------------------ */

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Normaliza qualquer valor de data do banco para yyyy-mm-dd. */
export function toISODate(value: unknown): string {
  const s = String(value ?? "").trim();
  return s ? s.slice(0, 10) : "";
}

export function formatDate(value: unknown): string {
  const iso = toISODate(value);
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
}

/** Dias entre hoje e a data (negativo = já passou). */
export function daysUntil(value: unknown): number | null {
  const iso = toISODate(value);
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d).getTime();
  const [ty, tm, td] = todayISO().split("-").map(Number);
  const today = new Date(ty!, tm! - 1, td!).getTime();
  return Math.round((target - today) / 86_400_000);
}

export function yearOf(value: unknown): number | null {
  const y = Number(toISODate(value).slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : null;
}

/* ------------------------------------------------------------------ */
/* Linhas do orçamento                                                 */
/* ------------------------------------------------------------------ */

export type Linha = {
  /** Chave local (React). */
  key: string;
  /** id em orcamento_itens quando já gravada. */
  id?: string | undefined;
  item_id: string;
  detalhe: string;
  quantidade: string;
  unidade_medida_id: string;
  valor_unitario: string;
  /** Memória de cálculo copiada do item no momento da inclusão. */
  preco_custo: number;
  imposto_pct: number;
};

export type LinhaCalc = {
  quantidade: number;
  valor_unitario: number;
  total_linha: number;
  custo_total: number;
  imposto_valor: number;
  lucro: number;
  margem_pct: number;
};

let seq = 0;
export const newKey = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

export function novaLinha(): Linha {
  return {
    key: newKey(),
    item_id: "",
    detalhe: "",
    quantidade: "1",
    unidade_medida_id: "",
    valor_unitario: "",
    preco_custo: 0,
    imposto_pct: 0,
  };
}

export function linhaFromRow(row: Row): Linha {
  return {
    key: String(rowId(row) ?? newKey()),
    id: rowId(row) !== undefined ? String(rowId(row)) : undefined,
    item_id: String(pick(row, ["item_id", "itens_id"]) ?? ""),
    detalhe: String(pick(row, ["detalhe"]) ?? ""),
    quantidade: String(pick(row, ["quantidade"]) ?? "1"),
    unidade_medida_id: String(pick(row, ["unidade_medida_id"]) ?? ""),
    valor_unitario: String(pick(row, ["valor_unitario"]) ?? ""),
    preco_custo: num(pick(row, ["preco_custo"])),
    imposto_pct: num(pick(row, ["imposto_pct", "imposto"])),
  };
}

/** Preenche a linha a partir do item escolhido (snapshot de preço, custo e imposto). */
export function aplicarItem(linha: Linha, item: Row | undefined): Linha {
  if (!item) return { ...linha, item_id: "" };
  return {
    ...linha,
    item_id: String(rowId(item) ?? ""),
    unidade_medida_id: String(pick(item, ["unidade_medida_id"]) ?? "") || linha.unidade_medida_id,
    valor_unitario: String(num(pick(item, ["preco_venda"]))),
    preco_custo: num(pick(item, ["preco_custo"])),
    imposto_pct: num(pick(item, ["imposto"])),
    quantidade: linha.quantidade || "1",
  };
}

/**
 * Memória de cálculo da linha:
 *  total_linha   = quantidade × valor_unitario
 *  custo_total   = quantidade × preco_custo
 *  imposto_valor = total_linha × imposto% / 100
 *  lucro         = total_linha − custo_total − imposto_valor
 */
export function calcLinha(
  l: Pick<Linha, "quantidade" | "valor_unitario" | "preco_custo" | "imposto_pct">,
): LinhaCalc {
  const quantidade = round3(Math.max(0, num(l.quantidade)));
  const valor_unitario = round2(Math.max(0, num(l.valor_unitario)));
  const total_linha = round2(quantidade * valor_unitario);
  const custo_total = round2(quantidade * Math.max(0, l.preco_custo));
  const imposto_valor = round2((total_linha * Math.max(0, l.imposto_pct)) / 100);
  const lucro = round2(total_linha - custo_total - imposto_valor);
  const margem_pct = total_linha > 0 ? round2((lucro / total_linha) * 100) : 0;
  return { quantidade, valor_unitario, total_linha, custo_total, imposto_valor, lucro, margem_pct };
}

/* ------------------------------------------------------------------ */
/* Totais do orçamento                                                 */
/* ------------------------------------------------------------------ */

export type Totais = {
  total_itens: number;
  desconto_valor: number;
  desconto_pct: number;
  frete: number;
  valores_adicionais: number;
  total_liquido: number;
  total_custo: number;
  total_imposto: number;
  /** Lucro somado das linhas (antes do desconto). */
  lucro_itens: number;
  /** Lucro após o desconto comercial. */
  total_lucro: number;
  /** Margem sobre (itens − desconto). */
  margem_pct: number;
};

export function calcTotais(
  linhas: LinhaCalc[],
  opts: {
    desconto_tipo: DescontoTipo;
    desconto: unknown;
    frete: unknown;
    valores_adicionais: unknown;
  },
): Totais {
  const total_itens = round2(linhas.reduce((s, l) => s + l.total_linha, 0));
  const total_custo = round2(linhas.reduce((s, l) => s + l.custo_total, 0));
  const total_imposto = round2(linhas.reduce((s, l) => s + l.imposto_valor, 0));
  const lucro_itens = round2(linhas.reduce((s, l) => s + l.lucro, 0));

  const descontoInformado = Math.max(0, num(opts.desconto));
  let desconto_valor =
    opts.desconto_tipo === "percentual"
      ? round2((total_itens * Math.min(100, descontoInformado)) / 100)
      : round2(descontoInformado);
  desconto_valor = Math.min(desconto_valor, total_itens);
  const desconto_pct = total_itens > 0 ? round2((desconto_valor / total_itens) * 100) : 0;

  const frete = round2(Math.max(0, num(opts.frete)));
  const valores_adicionais = round2(Math.max(0, num(opts.valores_adicionais)));
  const total_liquido = round2(total_itens - desconto_valor + frete + valores_adicionais);

  const total_lucro = round2(lucro_itens - desconto_valor);
  const base = total_itens - desconto_valor;
  const margem_pct = base > 0 ? round2((total_lucro / base) * 100) : 0;

  return {
    total_itens,
    desconto_valor,
    desconto_pct,
    frete,
    valores_adicionais,
    total_liquido,
    total_custo,
    total_imposto,
    lucro_itens,
    total_lucro,
    margem_pct,
  };
}

/* ------------------------------------------------------------------ */
/* Numeração                                                           */
/* ------------------------------------------------------------------ */

/** Formato "#2026-0001" (mesmo do gatilho no banco). */
export function formatNumero(ano: number, sequencia: number): string {
  return `#${ano}-${String(sequencia).padStart(4, "0")}`;
}
