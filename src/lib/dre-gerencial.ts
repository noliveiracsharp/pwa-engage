/** DRE Gerencial Consolidado — apuração pura a partir de títulos financeiros e seus rateios. */
type R = Record<string, unknown>;
export type Natureza = "receita" | "deducao" | "custo" | "despesa" | "financeiro";
export const NATUREZAS: Natureza[] = ["receita", "deducao", "custo", "despesa", "financeiro"];
export type Regime = "competencia" | "caixa";
export type FiltroDre = { inicio: string; fim: string; regime: Regime; centro?: string };

export type ContaDre = { id: string; codigo: string; descricao: string; natureza: Natureza; valor: number; meses: Record<string, number> };
export type ApuracaoDre = {
  meses: string[];
  contas: ContaDre[];
  porNatureza: Record<Natureza, number>;
  naoClassificado: { receber: number; pagar: number; quantidade: number };
  receitaBruta: number; deducoes: number; receitaLiquida: number; custos: number; lucroBruto: number;
  despesas: number; resultadoOperacional: number; financeiro: number; resultadoLiquido: number;
  margemLiquida: number; quantidadeTitulos: number;
};

const num = (v: unknown) => Number(v ?? 0) || 0;
const s = (v: unknown) => (v == null ? "" : String(v));
const r2 = (v: number) => Math.round(v * 100) / 100;

export function mesesEntre(inicio: string, fim: string): string[] {
  const out: string[] = [];
  let y = Number(inicio.slice(0, 4)), m = Number(inicio.slice(5, 7));
  const fy = Number(fim.slice(0, 4)), fm = Number(fim.slice(5, 7));
  if (!y || !m || !fy || !fm) return out;
  while (y < fy || (y === fy && m <= fm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

export function apurarDre(titulos: R[], itens: R[], contas: R[], f: FiltroDre): ApuracaoDre {
  const meses = mesesEntre(f.inicio, f.fim);
  const contaMap = new Map(contas.map((c) => [s(c["id"]), c]));
  const porTitulo = new Map<string, R[]>();
  for (const i of itens) {
    const k = s(i["titulo_id"]);
    (porTitulo.get(k) ?? porTitulo.set(k, []).get(k)!).push(i);
  }
  const acc = new Map<string, ContaDre>();
  const porNatureza = Object.fromEntries(NATUREZAS.map((n) => [n, 0])) as Record<Natureza, number>;
  const nc = { receber: 0, pagar: 0, quantidade: 0 };
  let qtd = 0;

  for (const t of titulos) {
    if (s(t["status"]) === "cancelado") continue;
    const valorTit = num(t["valor"]);
    let data: string; let fator: number;
    if (f.regime === "caixa") {
      const pago = num(t["valor_pago"]) || (s(t["status"]) === "pago" ? valorTit : 0);
      if (!t["pago_em"] || pago <= 0) continue;
      data = s(t["pago_em"]).slice(0, 10);
      fator = valorTit > 0 ? pago / valorTit : 1;
    } else {
      data = (s(t["data_competencia"]) || s(t["vencimento"])).slice(0, 10);
      fator = 1;
    }
    if (!data || data < f.inicio || data > f.fim) continue;
    const mes = data.slice(0, 7);
    const sinal = t["tipo"] === "receber" ? 1 : -1;
    const ls = porTitulo.get(s(t["id"]));
    const linhas = ls?.length
      ? ls.map((i) => ({ valor: num(i["valor"]), conta: s(i["plano_contas_id"]), centro: s(i["centro_custo_id"]) || s(t["centro_custo_id"]) }))
      : [{ valor: valorTit, conta: s(t["plano_contas_id"]), centro: s(t["centro_custo_id"]) }];
    let entrou = false;
    for (const l of linhas) {
      if (f.centro && l.centro !== f.centro) continue;
      const v = r2(l.valor * fator) * sinal;
      entrou = true;
      const c = l.conta ? contaMap.get(l.conta) : undefined;
      if (!c) {
        nc.quantidade++;
        if (sinal > 0) nc.receber += v; else nc.pagar -= v;
        continue;
      }
      const nat = (NATUREZAS.includes(s(c["natureza"]) as Natureza) ? s(c["natureza"]) : "despesa") as Natureza;
      porNatureza[nat] += v;
      const a = acc.get(l.conta) ?? { id: l.conta, codigo: s(c["codigo"]), descricao: s(c["descricao"]), natureza: nat, valor: 0, meses: {} };
      a.valor += v;
      a.meses[mes] = (a.meses[mes] ?? 0) + v;
      acc.set(l.conta, a);
    }
    if (entrou) qtd++;
  }
  for (const n of NATUREZAS) porNatureza[n] = r2(porNatureza[n]);
  const receitaBruta = porNatureza.receita;
  const deducoes = -porNatureza.deducao;
  const receitaLiquida = r2(receitaBruta - deducoes);
  const custos = -porNatureza.custo;
  const lucroBruto = r2(receitaLiquida - custos);
  const despesas = -porNatureza.despesa;
  const resultadoOperacional = r2(lucroBruto - despesas);
  const financeiro = porNatureza.financeiro;
  const resultadoLiquido = r2(resultadoOperacional + financeiro);
  return {
    meses, porNatureza,
    contas: [...acc.values()].map((c) => ({ ...c, valor: r2(c.valor) })).sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true })),
    naoClassificado: { receber: r2(nc.receber), pagar: r2(nc.pagar), quantidade: nc.quantidade },
    receitaBruta, deducoes, receitaLiquida, custos, lucroBruto, despesas, resultadoOperacional, financeiro, resultadoLiquido,
    margemLiquida: receitaLiquida ? r2((resultadoLiquido / receitaLiquida) * 100) : 0,
    quantidadeTitulos: qtd,
  };
}
