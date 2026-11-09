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
  /** Valor/data digitados à mão nesta parcela. */
  fixa?: boolean;
  data_manual?: boolean;
};

/** Condição comercial própria de cada serviço avulso (como a dos produtos). */
export type CondServico = {
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
  linhas: Array<{ linha: string; descricao: string; pagador: string; valor: number; inicio: string; parcelas: number; sid?: string; bloco?: string; cond?: CondServico }>,
): ParcelaServico[] {
  const out: ParcelaServico[] = [];
  for (const l of linhas) {
    const valor = round2(Math.max(0, num(l.valor)));
    const inicio = toISODate(l.inicio);
    if (valor <= 0 || !inicio) continue;
    const n = Math.max(1, Math.min(120, Math.floor(num(l.parcelas)) || 1));
    const c = l.cond ?? condServicoVazia();
    const entrada = n >= 2 ? calcEntrada(valor, c.entrada_tipo, c.entrada) : 0;
    for (const p of gerarParcelas({ total: valor, quantidade: n, primeiraData: inicio, comJuros: false, entrada, fixas: c.fixas, datas: c.datas }))
      out.push({
        ...p, linha: l.linha, descricao: l.descricao, pagador: l.pagador, total_parcelas: n,
        ...(l.sid ? { sid: l.sid } : {}), bloco: l.bloco ?? "", forma: c.forma, entrada_tipo: c.entrada_tipo, entrada: c.entrada,
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
