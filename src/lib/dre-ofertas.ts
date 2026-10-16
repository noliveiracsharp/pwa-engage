import { despesasFromValue, num } from "@/lib/orcamentos";
import type { Row } from "@/lib/row";

/** Linha consolidada de uma Oferta para a DRE gerencial (valores gravados ao salvar). */
export type DreLinha = {
  id: string;
  bruto: number; // itens + frete + adicionais
  desconto: number;
  liquido: number;
  custo: number;
  imposto: number;
  despesas: number;
  comissoes: number;
  resultado: number; // líquido − custo − imposto − despesas − comissões
  margem: number; // % sobre a receita líquida
  despesasPorCategoria: Record<string, number>;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Comissões só contam quando o papel tem beneficiário definido. */
export function comissoesDaOferta(comissoes: Row[], orcamentoId: string): number {
  return r2(
    comissoes
      .filter((c) => String(c["orcamento_id"] ?? "") === orcamentoId && c["beneficiario_id"])
      .reduce((s, c) => s + num(c["valor"]), 0),
  );
}

export function linhaDre(orc: Row, comissoes: number): DreLinha {
  const itens = num(orc["total_itens"]);
  const frete = num(orc["frete"]);
  const adicionais = num(orc["valores_adicionais"]);
  const desconto = num(orc["desconto_valor"]);
  const bruto = r2(itens + frete + adicionais);
  const liquido = r2(bruto - desconto);
  const custo = num(orc["total_custo"]);
  const imposto = num(orc["total_imposto"]);
  const lista = despesasFromValue(orc["despesas_operacionais"]);
  const porCat: Record<string, number> = {};
  for (const d of lista) porCat[d.categoria] = r2((porCat[d.categoria] ?? 0) + num(d.valor));
  const despesasLista = r2(Object.values(porCat).reduce((s, v) => s + v, 0));
  const despesas = despesasLista || num(orc["total_despesas"]);
  if (!despesasLista && despesas) porCat["outros"] = despesas;
  const resultado = r2(liquido - custo - imposto - despesas - comissoes);
  return {
    id: String(orc["id"] ?? ""),
    bruto,
    desconto,
    liquido,
    custo,
    imposto,
    despesas,
    comissoes,
    resultado,
    margem: liquido > 0 ? r2((resultado / liquido) * 100) : 0,
    despesasPorCategoria: porCat,
  };
}

export type DreTotais = Omit<DreLinha, "id"> & { quantidade: number; ticketMedio: number };

export function somarDre(linhas: DreLinha[]): DreTotais {
  const t = {
    bruto: 0, desconto: 0, liquido: 0, custo: 0, imposto: 0, despesas: 0, comissoes: 0, resultado: 0,
  };
  const porCat: Record<string, number> = {};
  for (const l of linhas) {
    for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += l[k];
    for (const [c, v] of Object.entries(l.despesasPorCategoria)) porCat[c] = r2((porCat[c] ?? 0) + v);
  }
  for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] = r2(t[k]);
  return {
    ...t,
    margem: t.liquido > 0 ? r2((t.resultado / t.liquido) * 100) : 0,
    despesasPorCategoria: porCat,
    quantidade: linhas.length,
    ticketMedio: linhas.length ? r2(t.liquido / linhas.length) : 0,
  };
}

/** Farol de margem do Board: verde ≥ 30%, amarelo 15–30%, vermelho < 15%. */
export function farolMargem(margem: number): "verde" | "amarelo" | "vermelho" {
  if (margem >= 30) return "verde";
  if (margem >= 15) return "amarelo";
  return "vermelho";
}

/** Trimestre (1–4) de uma data ISO. */
export function trimestreDe(value: unknown): number | null {
  const m = String(value ?? "").match(/^\d{4}-(\d{2})/);
  return m ? Math.floor((Number(m[1]) - 1) / 3) + 1 : null;
}

/** Etapa do Kanban que representa negócio perdido (desistência, perdido, cancelado, recusado). */
export function etapaPerdida(descricao: unknown): boolean {
  const s = String(descricao ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /desist|perdid|perda|cancel|recusad|reprovad/.test(s);
}

/** Etapa que representa venda ganha/contrato fechado. Usa o switch `etapa_ganha`; se nenhuma etapa
 *  estiver marcada, cai no nome (fechamento, ganha, aprovada, ativação) para não zerar o relatório. */
export function etapaGanha(e: { descricao: unknown; ganha?: boolean }, algumaMarcada: boolean): boolean {
  if (algumaMarcada) return e.ganha === true;
  const s = String(e.descricao ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /fechament|ganh|aprovad|ativac|assinad|contratad/.test(s);
}
