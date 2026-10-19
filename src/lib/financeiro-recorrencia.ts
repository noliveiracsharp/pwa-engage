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

/** Soma meses a AAAA-MM-DD ajustando fim de mês. */
function maisMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

export type PlanoTamanho = {
  renomear: { id: unknown; descricao: string; parcela_n: number }[];
  criar: { parcela_n: number; descricao: string; vencimento: string; valor: number }[];
  remover: unknown[];
  bloqueio?: string;
};

/** Muda a quantidade de parcelas de uma série: estende com novas mensais ou remove excedentes em aberto. */
export function planoTamanhoSerie(titulos: Row[], novoTotal: number): PlanoTamanho {
  const ord = [...titulos].sort((a, b) => String(a["vencimento"]).localeCompare(String(b["vencimento"])));
  const vazio: PlanoTamanho = { renomear: [], criar: [], remover: [] };
  if (!ord.length || novoTotal < 1) return { ...vazio, bloqueio: "Quantidade inválida." };
  const base = String(ord[0]!["descricao"] ?? "").replace(SUFIXO, "").trim();
  const nome = (n: number) => (novoTotal > 1 ? `${base} (${n}/${novoTotal})` : base);
  const excedentes = ord.slice(novoTotal);
  if (excedentes.some((t) => t["status"] === "pago" || !!t["pago_em"] || num(t["valor_pago"]) > 0))
    return { ...vazio, bloqueio: "Há parcelas já pagas além da nova quantidade. Estorne-as antes de reduzir." };
  const mantidas = ord.slice(0, novoTotal);
  const ultima = ord[ord.length - 1]!;
  const criar = Array.from({ length: Math.max(0, novoTotal - ord.length) }, (_, i) => {
    const n = ord.length + i + 1;
    return { parcela_n: n, descricao: nome(n), vencimento: maisMeses(String(ultima["vencimento"]), i + 1), valor: num(ultima["valor"]) };
  });
  return { renomear: mantidas.map((t, i) => ({ id: t["id"], descricao: nome(i + 1), parcela_n: i + 1 })), criar, remover: excedentes.map((t) => t["id"]) };
}
