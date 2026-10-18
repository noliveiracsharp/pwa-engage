import type { Row } from "@/lib/row";
import { num } from "@/lib/orcamentos";

export type EscopoRecorrencia = "atual" | "nao_vencidos" | "abertos" | "todos";

export function mesmaSerie(atual: Row, candidato: Row): boolean {
  return !!atual["origem_id"] && atual["origem_tipo"] === "manual"
    && candidato["origem_tipo"] === "manual" && candidato["origem_id"] === atual["origem_id"]
    && candidato["empresa_id"] === atual["empresa_id"] && candidato["tipo"] === atual["tipo"];
}

export function alvosRecorrencia(atual: Row, titulos: Row[], escopo: EscopoRecorrencia, hoje: string): Row[] {
  return titulos.filter((t) => {
    if (t["id"] === atual["id"]) return true;
    if (escopo === "atual" || !mesmaSerie(atual, t)) return false;
    if (escopo === "todos") return true;
    const semBaixa = !t["pago_em"] && num(t["valor_pago"]) === 0;
    return t["status"] === "aberto" && semBaixa
      && (escopo === "abertos" || String(t["vencimento"] ?? "").slice(0, 10) >= hoje);
  });
}

/** Aplica apenas campos alterados; datas mantêm o intervalo original entre parcelas. */
export function patchRecorrencia(atual: Row, destino: Row, alteracoes: Row): Row {
  const patch: Row = {};
  for (const [campo, valor] of Object.entries(alteracoes)) {
    if ((atual[campo] ?? null) === (valor ?? null)) continue;
    if ((campo === "vencimento" || campo === "data_competencia") && atual[campo] && destino[campo] && valor) {
      const delta = Date.parse(String(valor).slice(0, 10) + "T12:00:00Z") - Date.parse(String(atual[campo]).slice(0, 10) + "T12:00:00Z");
      const data = new Date(Date.parse(String(destino[campo]).slice(0, 10) + "T12:00:00Z") + delta);
      patch[campo] = data.toISOString().slice(0, 10);
    } else if (campo === "descricao" && destino["id"] !== atual["id"]) {
      const sufixo = String(destino[campo] ?? "").match(/\s\(\d+\/\d+\)$/)?.[0] ?? "";
      patch[campo] = String(valor).replace(/\s\(\d+\/\d+\)$/, "") + sufixo;
    } else if (campo !== "status" || destino["status"] !== "pago") {
      patch[campo] = valor;
    }
  }
  return patch;
}
const SUFIXO = /\s\((\d+)\/(\d+)\)$/;

/** Lançamento manual antigo (sem origem_id) com sufixo "(n/m)" na descrição. */
export function serieLegada(t: Row): { base: string; total: number } | null {
  if (t["origem_tipo"] !== "manual" || t["origem_id"]) return null;
  const m = String(t["descricao"] ?? "").match(SUFIXO);
  if (!m || Number(m[2]) < 2) return null;
  return { base: String(t["descricao"]).replace(SUFIXO, "").trim(), total: Number(m[2]) };
}

/** Parcelas antigas da mesma série: mesma empresa, tipo, parceiro, descrição base e total de parcelas. */
export function parcelasLegadas(atual: Row, titulos: Row[]): Row[] {
  const s = serieLegada(atual);
  if (!s) return [];
  return titulos.filter((t) => {
    const o = serieLegada(t);
    return !!o && o.base === s.base && o.total === s.total && t["empresa_id"] === atual["empresa_id"]
      && t["tipo"] === atual["tipo"] && (t["parceiro_id"] ?? null) === (atual["parceiro_id"] ?? null);
  });
}
