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
  const raw = String(value ?? "").trim();
  const v = raw.toLowerCase();
  const known = v.startsWith("aprov") || v.startsWith("reprov") || v.startsWith("rejeit") || v === "em andamento" || !raw;
  if (!known) {
    return { value: raw as Situacao, label: raw, badge: "bg-secondary text-secondary-foreground", dot: "bg-primary" };
  }
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
  /** produto / serviço avulso (implantação) ou recorrente (mensal). */
  natureza: Natureza;
  /** Bloco/ambiente opcional (ex.: "Frente do condomínio"). */
  bloco: string;
  /** Quem paga este item ("" = o próprio cliente da Oferta). */
  faturar_para_id: string;
  /** Serviço executado pela equipe própria ou terceirizado (fornecedor). */
  execucao: Execucao;
  /** Fornecedor que executa o serviço terceirizado (gera o contas a pagar). */
  fornecedor_id: string;
  /** Item incluso / apenas conferência: aparece no PDF sem valores; o custo segue para compras. */
  incluso: boolean;
  /** Desconto em R$ aplicado só nesta linha. */
  desconto_linha: string;
  /** Início da cobrança deste item recorrente ("" = início geral da Oferta). */
  dt_inicio_faturamento: string;
  /** Serviço avulso com início próprio: em quantas parcelas o cliente paga. */
  parcelas_faturamento: string;
};

export type Execucao = "interno" | "terceiro";

/** Mark-up divisor: preço = custo ÷ (1 − margem% − imposto%). Null quando inviável. */
export function precoPorMarkup(custo: number, margemPct: number, impostoPct: number): number | null {
  const d = 1 - margemPct / 100 - impostoPct / 100;
  if (!(custo > 0) || d <= 0) return null;
  return round2(custo / d);
}

/** Agrupa linhas por bloco na ordem em que aparecem; linhas sem bloco ficam no grupo "" (geral). */
export function agruparPorBloco<T>(rows: T[], getBloco: (r: T) => string): Array<{ bloco: string; rows: T[] }> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const b = (getBloco(r) ?? "").trim();
    if (!map.has(b)) map.set(b, []);
    map.get(b)!.push(r);
  }
  const grupos = [...map.entries()].map(([bloco, rows]) => ({ bloco, rows }));
  // Itens gerais (sem bloco) vão por último quando há blocos nomeados.
  return grupos.sort((a, b) => (a.bloco === "" ? 1 : 0) - (b.bloco === "" ? 1 : 0));
}

export type LinhaCalc = {
  quantidade: number;
  valor_unitario: number;
  total_linha: number;
  custo_total: number;
  imposto_valor: number;
  lucro: number;
  margem_pct: number;
  desconto_linha: number;
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
    natureza: "produto",
    bloco: "",
    faturar_para_id: "",
    execucao: "interno",
    fornecedor_id: "",
    incluso: false,
    desconto_linha: "",
    dt_inicio_faturamento: "",
    parcelas_faturamento: "1",
  };
}

export function linhaFromRow(row: Row, itemTipo?: unknown): Linha {
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
    natureza: naturezaOf(row["natureza"], itemTipo),
    bloco: String(row["bloco"] ?? ""),
    faturar_para_id: String(row["faturar_para_id"] ?? ""),
    execucao: row["execucao"] === "terceiro" ? "terceiro" : "interno",
    fornecedor_id: String(row["fornecedor_id"] ?? ""),
    incluso: row["incluso"] === true,
    desconto_linha: num(row["desconto_linha"]) > 0 ? String(num(row["desconto_linha"])) : "",
    dt_inicio_faturamento: row["dt_inicio_faturamento"] ? String(row["dt_inicio_faturamento"]).slice(0, 10) : "",
    parcelas_faturamento: String(Math.max(1, Math.floor(num(row["parcelas_faturamento"])) || 1)),
  };
}

/** Preenche a linha a partir do item escolhido (snapshot de preço, custo e imposto). */
export function aplicarItem(linha: Linha, item: Row | undefined): Linha {
  if (!item) return { ...linha, item_id: "" };
  const novoId = String(rowId(item) ?? "");
  const espec = String(pick(item, ["especificacao"]) ?? "").trim();
  // Descrição padrão do cadastro: entra ao escolher um item diferente; o texto continua editável na Oferta.
  const detalhe = espec && novoId !== linha.item_id ? espec : linha.detalhe;
  return {
    ...linha,
    item_id: novoId,
    detalhe,
    unidade_medida_id: String(pick(item, ["unidade_medida_id"]) ?? "") || linha.unidade_medida_id,
    valor_unitario: String(num(pick(item, ["preco_venda"]))),
    preco_custo: num(pick(item, ["preco_custo"])),
    imposto_pct: num(pick(item, ["imposto"])),
    natureza: naturezaDoTipo(item["tipo"]),
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
  l: Pick<Linha, "quantidade" | "valor_unitario" | "preco_custo" | "imposto_pct"> & { desconto_linha?: string },
): LinhaCalc {
  const quantidade = round3(Math.max(0, num(l.quantidade)));
  const valor_unitario = round2(Math.max(0, num(l.valor_unitario)));
  const bruto = round2(quantidade * valor_unitario);
  const desconto_linha = Math.min(bruto, round2(Math.max(0, num(l.desconto_linha))));
  const total_linha = round2(bruto - desconto_linha);
  const custo_total = round2(quantidade * Math.max(0, l.preco_custo));
  const imposto_valor = round2((total_linha * Math.max(0, l.imposto_pct)) / 100);
  const lucro = round2(total_linha - custo_total - imposto_valor);
  const margem_pct = total_linha > 0 ? round2((lucro / total_linha) * 100) : 0;
  return { quantidade, valor_unitario, total_linha, custo_total, imposto_valor, lucro, margem_pct, desconto_linha };
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

/* ------------------------------------------------------------------ */
/* Pagamento e parcelamento                                            */
/* ------------------------------------------------------------------ */

export const FORMAS_PAGAMENTO = [
  "Pix",
  "Boleto bancário",
  "Cartão de crédito",
  "Cartão de débito",
  "Transferência bancária",
  "Dinheiro",
  "Faturado",
  "A combinar",
] as const;

export type Parcela = {
  /** Número da parcela (1, 2, 3…). */
  numero: number;
  /** Data de vencimento (yyyy-mm-dd). */
  vencimento: string;
  valor: number;
};

/** Soma meses preservando o dia (ajusta para o último dia quando o mês é menor). */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const alvo = new Date(y, m - 1 + months, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  const dia = Math.min(d, ultimoDia);
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Gera o cronograma de parcelas mensais.
 *  - Sem juros: valor total dividido pela quantidade.
 *  - Com juros: valor de cada parcela = total × coeficiente (tabela de coeficientes).
 * A diferença de centavos do arredondamento é ajustada na última parcela.
 */
export function gerarParcelas(opts: {
  total: number;
  quantidade: number;
  primeiraData: string;
  comJuros: boolean;
  coeficiente?: unknown;
  /** Entrada em R$ paga na 1ª parcela; juros incidem só sobre o saldo. */
  entrada?: number;
  /** Valores fixados à mão por número de parcela; o saldo é rateado nas demais. */
  fixas?: Record<number, number>;
  /** Datas de vencimento alteradas à mão (número da parcela → yyyy-mm-dd). */
  datas?: Record<number, string>;
}): Parcela[] {
  const qtd = Math.max(1, Math.floor(num(opts.quantidade)));
  const total = round2(Math.max(0, num(opts.total)));
  const primeira = toISODate(opts.primeiraData);
  if (!primeira || total <= 0) return [];

  const entrada = qtd >= 2 ? round2(Math.min(Math.max(0, num(opts.entrada)), total)) : 0;
  const saldo = round2(total - entrada);
  const n = entrada > 0 ? qtd - 1 : qtd;
  const coef = num(opts.coeficiente);
  const valorParcela =
    opts.comJuros && coef > 0 ? round2(saldo * coef) : round2(saldo / n);
  const totalParcelado = opts.comJuros && coef > 0 ? round2(entrada + valorParcela * n) : total;

  const valores: number[] = [];
  for (let i = 0; i < qtd; i += 1) valores.push(entrada > 0 && i === 0 ? entrada : valorParcela);

  // Valores fixados manualmente: o restante é rateado entre as parcelas livres.
  const fixas = opts.fixas ?? {};
  const livres: number[] = [];
  let somaFixas = 0;
  for (let i = 0; i < qtd; i += 1) {
    const f = fixas[i + 1];
    if (entrada > 0 && i === 0) somaFixas += entrada;
    else if (f !== undefined && Number.isFinite(f)) {
      valores[i] = round2(Math.max(0, f));
      somaFixas += valores[i]!;
    } else livres.push(i);
  }
  if (livres.length > 0) {
    const resto = Math.max(0, round2(totalParcelado - somaFixas));
    const cada = round2(resto / livres.length);
    let acc = 0;
    livres.forEach((idx, k) => {
      const v = k === livres.length - 1 ? round2(resto - acc) : cada;
      valores[idx] = v;
      acc = round2(acc + v);
    });
  }

  return valores.map((valor, i) => ({
    numero: i + 1,
    vencimento: toISODate(opts.datas?.[i + 1]) || addMonthsISO(primeira, i),
    valor,
  }));
}

/** Entrada em R$ a partir do tipo (percentual do total ou valor). */
export function calcEntrada(total: number, tipo: string, entrada: unknown): number {
  const v = Math.max(0, num(entrada));
  const t = Math.max(0, num(total));
  return round2(Math.min(t, tipo === "percentual" ? (t * Math.min(100, v)) / 100 : v));
}

export const somaParcelas = (parcelas: Parcela[]) =>
  round2(parcelas.reduce((s, p) => s + p.valor, 0));

/** Lê o cronograma gravado no banco (jsonb ou texto). */
export function parcelasFromValue(value: unknown): Parcela[] {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p, i) => {
      const o = (p ?? {}) as Record<string, unknown>;
      return {
        numero: Number(o["numero"] ?? i + 1) || i + 1,
        vencimento: toISODate(o["vencimento"]),
        valor: num(o["valor"]),
      };
    })
    .filter((p) => p.vencimento !== "");
}

/* ------------------------------------------------------------------ */
/* Natureza dos itens e modalidade comercial                           */
/* ------------------------------------------------------------------ */

/** produto/servico = implantação (pago uma vez); recorrente = mensalidade. */
export type Natureza = "produto" | "servico" | "recorrente";

export const NATUREZAS: Array<{ value: Natureza; label: string; curto: string }> = [
  { value: "produto", label: "Produto", curto: "Produto" },
  { value: "servico", label: "Serviço avulso", curto: "Serviço" },
  { value: "recorrente", label: "Serviço recorrente (mensal)", curto: "Mensal" },
];

/** Converte o "tipo" do cadastro de itens (Produto / Serviço / Serviço Recorrente) em natureza. */
export function naturezaDoTipo(tipo: unknown): Natureza {
  const t = String(tipo ?? "").trim().toLowerCase();
  if (t.includes("recorr") || t.includes("mensal")) return "recorrente";
  if (t.startsWith("serv")) return "servico";
  return "produto";
}

export function naturezaOf(value: unknown, fallbackTipo?: unknown): Natureza {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "produto" || v === "servico" || v === "recorrente") return v;
  return naturezaDoTipo(fallbackTipo);
}

export type Modalidade = "avista" | "prazo" | "comodato";

export const MODALIDADES: Array<{ value: Modalidade; label: string; descricao: string }> = [
  { value: "avista", label: "À vista", descricao: "Pagamento único com desconto opcional." },
  { value: "prazo", label: "A prazo", descricao: "Parcelado sem juros ou com juros." },
  { value: "comodato", label: "Comodato", descricao: "Equipamentos cedidos, parcelado com juros." },
];

export function modalidadeOf(value: unknown): Modalidade {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "avista" || v === "comodato" ? v : "prazo";
}

export const modalidadeLabel = (m: unknown) =>
  MODALIDADES.find((x) => x.value === modalidadeOf(m))?.label ?? "A prazo";

/** Valor à vista: total líquido − desconto à vista (R$ ou %). */
export function calcAvista(totalLiquido: number, tipo: DescontoTipo, desconto: unknown) {
  const d = Math.max(0, num(desconto));
  let valor = tipo === "percentual" ? round2((totalLiquido * Math.min(100, d)) / 100) : round2(d);
  valor = Math.min(valor, totalLiquido);
  return { desconto_valor: valor, total: round2(totalLiquido - valor) };
}

/* ------------------------------------------------------------------ */
/* Despesas operacionais (alimentação, transporte…)                     */
/* ------------------------------------------------------------------ */

export const CATEGORIAS_DESPESA = [
  { value: "transporte", label: "Transporte / Combustível / Km" },
  { value: "alimentacao", label: "Alimentação / Diárias" },
  { value: "hospedagem", label: "Hospedagem" },
  { value: "locacao", label: "Locação de equipamentos / Andaimes" },
  { value: "taxas", label: "Taxas / ART / Licenças" },
  { value: "outros", label: "Outros" },
] as const;

export type CategoriaDespesa = (typeof CATEGORIAS_DESPESA)[number]["value"];

export type DespesaOperacional = {
  key: string;
  categoria: CategoriaDespesa;
  descricao: string;
  valor: string;
};

export const categoriaDespesaLabel = (v: unknown) =>
  CATEGORIAS_DESPESA.find((c) => c.value === v)?.label ?? "Outros";

export function novaDespesa(): DespesaOperacional {
  return { key: newKey(), categoria: "transporte", descricao: "", valor: "" };
}

/** Soma das despesas (valores negativos/ inválidos contam como 0). */
export function totalDespesas(despesas: Array<{ valor: unknown }>): number {
  return round2(despesas.reduce((s, d) => s + Math.max(0, num(d.valor)), 0));
}

/** Lê o JSONB gravado em orcamentos.despesas_operacionais. */
export function despesasFromValue(value: unknown): DespesaOperacional[] {
  let arr: unknown = value;
  if (typeof value === "string") {
    try {
      arr = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((d: Row) => {
    const cat = CATEGORIAS_DESPESA.some((c) => c.value === d["categoria"])
      ? (d["categoria"] as CategoriaDespesa)
      : "outros";
    return { key: newKey(), categoria: cat, descricao: String(d["descricao"] ?? ""), valor: String(num(d["valor"]) || "") };
  });
}

/** Formato gravado: só linhas com valor > 0. */
export function despesasToValue(despesas: DespesaOperacional[]) {
  return despesas
    .filter((d) => num(d.valor) > 0)
    .map((d) => ({ categoria: d.categoria, descricao: d.descricao.trim(), valor: round2(num(d.valor)) }));
}

/* ------------------------------------------------------------------ */
/* Condição de pagamento ao fornecedor (custo dos itens)               */
/* ------------------------------------------------------------------ */

export type CompraModo = "espelhar" | "avista" | "personalizado";

export type CondicaoCompra = {
  modo: CompraModo;
  /** Quantidade de parcelas (modo personalizado). */
  parcelas: string;
  /** 1º vencimento (avista/personalizado), yyyy-mm-dd. */
  primeira: string;
  obs: string;
  /** Serviços avulsos terceirizados: parcelas e 1º vencimento por fornecedor. */
  terceiros?: Record<string, { parcelas: string; primeira: string }>;
};

export const COMPRA_MODOS: Array<{ value: CompraModo; label: string }> = [
  { value: "espelhar", label: "Acompanhar parcelas do cliente" },
  { value: "avista", label: "À vista / Entrada" },
  { value: "personalizado", label: "Parcelado com o fornecedor" },
];

export const condicaoCompraPadrao = (): CondicaoCompra => ({ modo: "espelhar", parcelas: "1", primeira: "", obs: "" });

export function condicaoCompraFromValue(value: unknown): CondicaoCompra {
  let v: unknown = value;
  if (typeof value === "string") {
    try { v = JSON.parse(value); } catch { v = null; }
  }
  const base = condicaoCompraPadrao();
  if (!v || typeof v !== "object") return base;
  const r = v as Row;
  const modo = COMPRA_MODOS.some((m) => m.value === r["modo"]) ? (r["modo"] as CompraModo) : "espelhar";
  return {
    modo,
    parcelas: String(Math.max(1, Math.floor(num(r["parcelas"]) || 1))),
    primeira: toISODate(r["primeira"]) || "",
    obs: String(r["obs"] ?? ""),
    terceiros: Object.fromEntries(Object.entries((r["terceiros"] && typeof r["terceiros"] === "object" ? r["terceiros"] : {}) as Record<string, Row>)
      .map(([f, t]) => [f, { parcelas: String(Math.max(1, Math.floor(num(t?.["parcelas"]) || 1))), primeira: toISODate(t?.["primeira"]) || "" }])),
  };
}

export function condicaoCompraToValue(c: CondicaoCompra) {
  return {
    modo: c.modo,
    parcelas: Math.max(1, Math.floor(num(c.parcelas) || 1)),
    primeira: toISODate(c.primeira) || null,
    obs: c.obs.trim(),
    terceiros: Object.fromEntries(Object.entries(c.terceiros ?? {}).map(([f, t]) => [f, { parcelas: Math.max(1, Math.floor(num(t.parcelas) || 1)), primeira: toISODate(t.primeira) || null }])),
  };
}

/**
 * Cronograma de pagamento do custo ao fornecedor.
 *  - espelhar: mesmas datas e mesma proporção das parcelas do cliente;
 *  - avista: tudo na data informada (ou no 1º vencimento do cliente);
 *  - personalizado: N parcelas mensais iguais a partir da data informada.
 */
export function cronogramaCompra(opts: {
  custo: number;
  condicao: CondicaoCompra;
  parcelasCliente: Parcela[];
  dataPadrao: string;
}): Parcela[] {
  const custo = round2(Math.max(0, num(opts.custo)));
  if (custo <= 0) return [];
  const c = opts.condicao;
  const inicio = toISODate(c.primeira) || opts.parcelasCliente[0]?.vencimento || toISODate(opts.dataPadrao);
  if (c.modo === "espelhar" && opts.parcelasCliente.length > 0) {
    const totalCli = opts.parcelasCliente.reduce((s, p) => s + Math.max(0, p.valor), 0);
    if (totalCli > 0) {
      let acc = 0;
      const n = opts.parcelasCliente.length;
      return opts.parcelasCliente.map((p, i) => {
        const valor = i === n - 1 ? round2(custo - acc) : round2((custo * Math.max(0, p.valor)) / totalCli);
        acc = round2(acc + valor);
        return { numero: i + 1, vencimento: p.vencimento, valor };
      });
    }
  }
  if (!inicio) return [];
  if (c.modo === "personalizado") {
    return gerarParcelas({ total: custo, quantidade: num(c.parcelas) || 1, primeiraData: inicio, comJuros: false });
  }
  return [{ numero: 1, vencimento: inicio, valor: custo }];
}

/** Detalhe do item em texto puro (contrato, financeiro, nota fiscal, WhatsApp): o editor grava HTML. */
export function textoDetalhe(v: unknown): string {
  return String(v ?? "")
    .replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Texto do selo "Enviada ao cliente" (data/hora e canal do último envio), ou null se nunca enviada. */
export function seloEnvio(o: Row | null | undefined): string | null {
  const em = o?.["enviada_em"];
  if (!em) return null;
  const d = new Date(String(em));
  if (isNaN(d.getTime())) return null;
  const canal = o?.["enviada_canal"] === "email" ? "e-mail" : o?.["enviada_canal"] === "whatsapp" ? "WhatsApp" : "";
  const hm = (x: Date) => `${x.toLocaleDateString("pt-BR")} ${x.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  const v = o?.["visualizado_em"] ? new Date(String(o["visualizado_em"])) : null;
  const leitura = v && !isNaN(v.getTime()) ? ` • Aberta ${hm(v)}` : "";
  return `Enviada ${hm(d)}${canal ? ` via ${canal}` : ""}${leitura}`;
}
