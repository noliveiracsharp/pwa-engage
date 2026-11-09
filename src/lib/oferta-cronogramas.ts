import { calcEntrada, gerarParcelas, num, round2, toISODate, type Parcela } from "@/lib/orcamentos";

/** Serviço avulso com início de cobrança próprio: sai do parcelamento geral e ganha cronograma separado. */
export const servicoSeparado = (l: { natureza?: unknown; dt_inicio_faturamento?: unknown }) =>
  String(l.natureza ?? "") === "servico" && Boolean(toISODate(l.dt_inicio_faturamento));

export type ParcelaServico = Parcela & {
  /** Índice/identificação da linha de origem. */
  linha: string;
  descricao: string;
  /** Pagador ("" = cliente da Oferta). */
  pagador: string;
  total_parcelas: number;
  /** Identificador estável do serviço (item + ocorrência) para guardar a condição. */
  sid?: string;
  /** Ambiente/bloco de origem do serviço. */
  bloco?: string;
  forma?: string;
  entrada_tipo?: "percentual" | "valor";
  entrada?: string;
  modo?: ModoServico;
  juros?: string;
  taxa_instalacao?: string;
  taxa_isenta?: boolean;
  /** Valor/data digitados à mão nesta parcela. */
  fixa?: boolean;
  data_manual?: boolean;
};

/** Condição comercial própria de cada serviço avulso (como a dos produtos). */
export type ModoServico = "sem_juros" | "com_juros" | "comodato";
export type CondServico = {
  /** Sem juros, com juros (taxa ao mês) ou comodato (taxa de instalação). */
  modo?: ModoServico;
  juros?: string;
  taxa_instalacao?: string;
  taxa_isenta?: boolean;
  forma: string;
  entrada_tipo: "percentual" | "valor";
  entrada: string;
  fixas: Record<number, number>;
  datas: Record<number, string>;
};

export const condServicoVazia = (): CondServico => ({ forma: "", entrada_tipo: "percentual", entrada: "", fixas: {}, datas: {} });

/** Identificador estável: item + ocorrência entre os serviços separados (as chaves de linha mudam ao recarregar). */
export function sidsServicos(linhas: Array<{ item_id: string }>): string[] {
  const cont = new Map<string, number>();
  return linhas.map((l) => {
    const n = (cont.get(l.item_id) ?? 0) + 1;
    cont.set(l.item_id, n);
    return `${l.item_id}#${n}`;
  });
}

/** Cronograma de recebimento de cada serviço avulso separado: N parcelas a partir do início, com entrada e ajustes próprios. */
export function cronogramaServicos(
  linhas: Array<{ linha: string; descricao: string; pagador: string; valor: number; inicio: string; parcelas: number; sid?: string; bloco?: string; cond?: CondServico | undefined }>,
): ParcelaServico[] {
  const out: ParcelaServico[] = [];
  for (const l of linhas) {
    const valor = round2(Math.max(0, num(l.valor)));
    const inicio = toISODate(l.inicio);
    if (valor <= 0 || !inicio) continue;
    const n = Math.max(1, Math.min(120, Math.floor(num(l.parcelas)) || 1));
    const c = l.cond ?? condServicoVazia();
    const modo = c.modo ?? "sem_juros";
    const base = modo === "comodato" ? (c.taxa_isenta ? 0 : round2(num(c.taxa_instalacao))) : valor;
    if (base <= 0) continue;
    const entrada = n >= 2 ? calcEntrada(base, c.entrada_tipo, c.entrada) : 0;
    const nFin = entrada > 0 ? n - 1 : n;
    const i = num(c.juros) / 100;
    const coef = modo === "com_juros" && i > 0 && nFin > 0 ? i / (1 - Math.pow(1 + i, -nFin)) : 0;
    for (const p of gerarParcelas({ total: base, quantidade: n, primeiraData: inicio, comJuros: coef > 0, coeficiente: coef, entrada, fixas: c.fixas, datas: c.datas }))
      out.push({
        ...p, linha: l.linha, descricao: l.descricao, pagador: l.pagador, total_parcelas: n,
        ...(l.sid ? { sid: l.sid } : {}), bloco: l.bloco ?? "", forma: c.forma, entrada_tipo: c.entrada_tipo, entrada: c.entrada,
        modo, juros: c.juros ?? "", taxa_instalacao: c.taxa_instalacao ?? "", taxa_isenta: Boolean(c.taxa_isenta),
        ...(c.fixas[p.numero] !== undefined ? { fixa: true } : {}),
        ...(c.datas[p.numero] ? { data_manual: true } : {}),
      });
  }
  return out;
}

/** Reconstrói as condições por serviço a partir do cronograma gravado. */
export function condicoesDoCronograma(v: unknown): Record<string, CondServico> {
  const arr = Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
  const out: Record<string, CondServico> = {};
  for (const p of arr) {
    const sid = String(p["sid"] ?? "");
    if (!sid) continue;
    const c = (out[sid] ??= {
      forma: String(p["forma"] ?? ""),
      entrada_tipo: p["entrada_tipo"] === "valor" ? "valor" : "percentual",
      entrada: String(p["entrada"] ?? ""),
      modo: p["modo"] === "com_juros" || p["modo"] === "comodato" ? p["modo"] : "sem_juros",
      juros: String(p["juros"] ?? ""),
      taxa_instalacao: String(p["taxa_instalacao"] ?? ""),
      taxa_isenta: p["taxa_isenta"] === true,
      fixas: {}, datas: {},
    });
    const n = Math.floor(num(p["numero"]));
    if (p["fixa"] === true) c.fixas[n] = num(p["valor"]);
    if (p["data_manual"] === true && toISODate(p["vencimento"])) c.datas[n] = toISODate(p["vencimento"]);
  }
  return out;
}

/** Agrupa as parcelas por serviço, mantendo a ordem. */
export function agruparServicos<T extends { linha: string }>(ps: T[]): Array<{ linha: string; parcelas: T[] }> {
  const m = new Map<string, T[]>();
  for (const p of ps) (m.get(p.linha) ?? m.set(p.linha, []).get(p.linha)!).push(p);
  return [...m.entries()].map(([linha, parcelas]) => ({ linha, parcelas }));
}

export type CondTerceiro = { parcelas: string; primeira: string };

/** Custo dos serviços avulsos terceirizados por fornecedor, com a data de início mais cedo dos serviços dele. */
export function terceirosAvulsos(
  linhas: Array<{ natureza: string; execucao: string; fornecedor_id: string; custo: number; dt_inicio_faturamento: string }>,
): Array<{ fornecedor: string; custo: number; inicio: string }> {
  const m = new Map<string, { custo: number; inicio: string }>();
  for (const l of linhas) {
    if (l.natureza !== "servico" || l.execucao !== "terceiro" || !l.fornecedor_id) continue;
    const a = m.get(l.fornecedor_id) ?? { custo: 0, inicio: "" };
    const d = toISODate(l.dt_inicio_faturamento);
    m.set(l.fornecedor_id, { custo: round2(a.custo + Math.max(0, num(l.custo))), inicio: d && (!a.inicio || d < a.inicio) ? d : a.inicio });
  }
  return [...m.entries()].map(([fornecedor, v]) => ({ fornecedor, ...v }));
}

/** Parcelas a pagar a um fornecedor terceirizado: 1º vencimento informado, senão o início do serviço, senão o padrão. */
export function cronogramaTerceiro(custo: number, cfg: Partial<CondTerceiro> | undefined, inicioServico: string, padrao: string): Parcela[] {
  const v = round2(Math.max(0, num(custo)));
  const inicio = toISODate(cfg?.primeira) || toISODate(inicioServico) || toISODate(padrao);
  if (v <= 0 || !inicio) return [];
  return gerarParcelas({ total: v, quantidade: Math.max(1, Math.floor(num(cfg?.parcelas)) || 1), primeiraData: inicio, comJuros: false });
}
