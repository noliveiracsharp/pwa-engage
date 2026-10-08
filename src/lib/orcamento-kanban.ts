import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";
import { SITUACOES } from "@/lib/orcamentos";

const ETAPA_KANBAN_KEYS = ["kanban_nome_id", "kanban_id", "id_kanban"];

/** Situações válidas do CHECK de `orcamentos.situacao`. */
export function isSituacaoValida(v: unknown): v is string {
  return SITUACOES.some((s) => s.value === String(v ?? "").trim());
}

const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Valor da primeira coluna cujo nome contenha todos os trechos (ex.: "func"). */
function colunaCom(r: Row, partes: string[], excluir: string[] = []): unknown {
  const k = Object.keys(r).find(
    (c) => partes.every((p) => c.toLowerCase().includes(p)) && !excluir.some((e) => c.toLowerCase().includes(e)),
  );
  return k ? r[k] : undefined;
}

/** Descobre o kanban vinculado ao módulo de Orçamentos via `funcoes_kanban`. */
export async function kanbanDoModuloOrcamentos(): Promise<string | null> {
  const { data: funcoes } = await supabase.from("funcoes").select("*");
  const ids = ((funcoes ?? []) as Row[])
    .filter((f) => {
      const path = norm(f["path"]).replace(/^\/+|\/+$/g, "");
      const desc = norm(pick(f, ["descricao", "nome"]));
      return path === "orcamentos" || path.endsWith("/orcamentos") || desc.startsWith("orcamento");
    })
    // A chave de `funcoes` pode ser `funcao_id` (não `id`).
    .flatMap((f) =>
      ["funcao_id", "funcoes_id", "id"]
        .map((k) => f[k])
        .filter((v) => v !== undefined && v !== null && v !== "")
        .map(String),
    );
  if (!ids.length) return null;
  // A tabela de vínculo pode se chamar `kanban_funcoes` ou `funcoes_kanban`.
  let linhas: Row[] = [];
  for (const tabela of ["kanban_funcoes", "funcoes_kanban"]) {
    const { data, error } = await supabase.from(tabela as never).select("*");
    if (!error && data?.length) {
      linhas = data as Row[];
      break;
    }
  }
  const v =
    linhas.find((r) => ids.includes(String(colunaCom(r, ["func"]) ?? ""))) ?? null;
  if (!v) return null;
  const k = pick(v, ["kanban_nome_id", "kanban_id", "id_kanban"]) ?? colunaCom(v, ["kanban"], ["func"]);
  return k ? String(k) : null;
}

/** ID da etapa do kanban cuja descrição bate com a situação (ignora acento/maiúsculas). */
export async function etapaPorDescricao(
  kanbanNomeId: string | null,
  descricao: string,
): Promise<string | null> {
  if (!kanbanNomeId) return null;
  const etapas = await etapasDoKanban(kanbanNomeId);
  const alvo = norm(descricao);
  const e = etapas.find((r) => norm(r.descricao) === alvo);
  return e ? e.id : null;
}

/**
 * Completa o cabeçalho com `kanban_nome_id`/`kanban_etapa_id` coerentes com a situação.
 * A etapa é sempre recalculada pela situação, para o card nunca ficar na coluna antiga.
 */
export async function vincularKanban(header: Row, original: Row | null): Promise<Row> {
  const situacao = String(header["situacao"] ?? "Em andamento");
  let kanbanId = original?.["kanban_nome_id"] ? String(original["kanban_nome_id"]) : null;
  if (!kanbanId) kanbanId = await kanbanDoModuloOrcamentos();
  if (!kanbanId) return header;
  const etapaId = await etapaPorDescricao(kanbanId, situacao);
  return {
    ...header,
    kanban_nome_id: kanbanId,
    ...(etapaId ? { kanban_etapa_id: etapaId } : {}),
  };
}

/** Tabela base (`funcoes.tabela_base`) da função vinculada ao kanban. */
export async function tabelaDoKanban(kanbanNomeId: string): Promise<string | null> {
  const v = await vinculoDoKanban(kanbanNomeId);
  if (!v) return null;
  const funcaoId = pick(v.row, ["funcao_id", "funcoes_id", "id_funcao"]) ?? colunaCom(v.row, ["func"]);
  if (funcaoId === undefined || funcaoId === null) return null;
  for (const k of ["funcao_id", "id"]) {
    const { data, error } = await supabase.from("funcoes").select("*").eq(k, funcaoId as never).maybeSingle();
    if (!error && data) {
      const t = (data as Row)["tabela_base"];
      return t ? String(t).trim() : null;
    }
  }
  return null;
}

export type EtapaKanban = { id: string; descricao: string };

/** Etapas do kanban (ordem ascendente) — opções dinâmicas da Situação. */
export async function etapasDoKanban(kanbanNomeId: string | null): Promise<EtapaKanban[]> {
  if (!kanbanNomeId) return [];
  const { data, error } = await supabase
    .from("kanban_etapas")
    .select("*")
    .eq("kanban_nome_id", kanbanNomeId)
    .order("ordem", { ascending: true });
  if (error) return [];
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r["id"]),
    descricao: String(r["descricao"] ?? ""),
  }));
}

export type CampoCard = { key: string; label: string };

/** Campos disponíveis para o card de Orçamentos no Kanban. */
export const CAMPOS_CARD_ORCAMENTO: CampoCard[] = [
  { key: "numero", label: "Número" },
  { key: "parceiro_id", label: "Cliente" },
  { key: "total_liquido", label: "Total Líquido" },
  { key: "dt_orcamento", label: "Data da Oferta" },
  { key: "usuario_id", label: "Vendedor" },
];

export const CAMPOS_CARD_PADRAO: CampoCard[] = [
  CAMPOS_CARD_ORCAMENTO[0]!,
  CAMPOS_CARD_ORCAMENTO[2]!,
];

export type VinculoKanban = { tabela: string; row: Row };

/** Linha de vínculo Função↔Kanban para o kanban informado. */
export async function vinculoDoKanban(kanbanNomeId: string): Promise<VinculoKanban | null> {
  for (const tabela of ["funcoes_kanban", "kanban_funcoes"]) {
    const { data, error } = await supabase.from(tabela as never).select("*");
    if (error || !data) continue;
    const row = (data as Row[]).find(
      (r) =>
        String(pick(r, ["kanban_nome_id", "kanban_id", "id_kanban"]) ?? colunaCom(r, ["kanban"], ["func", "campos"]) ?? "") ===
        kanbanNomeId,
    );
    if (row) return { tabela, row };
  }
  return null;
}

export function parseCamposCard(v: unknown): CampoCard[] | null {
  let val = v;
  if (typeof val === "string") {
    try { val = JSON.parse(val); } catch { return null; }
  }
  if (!Array.isArray(val)) return null;
  return val
    .filter((c) => c && typeof c === "object" && typeof (c as Row)["key"] === "string")
    .map((c) => ({ key: String((c as Row)["key"]), label: String((c as Row)["label"] ?? (c as Row)["key"]) }));
}

/** Grava `campos_card` na linha de vínculo. */
export async function salvarCamposCard(v: VinculoKanban, campos: CampoCard[]) {
  let q = supabase.from(v.tabela as never).update({ campos_card: campos } as never);
  if (v.row["id"] !== undefined) q = q.eq("id", v.row["id"] as never);
  else {
    for (const [k, val] of Object.entries(v.row)) {
      if (k === "campos_card" || val === null || typeof val === "object") continue;
      q = q.eq(k, val as never);
    }
  }
  const { error } = await q;
  if (error) throw error;
}

// ================= Motor universal de cards =================

export type CampoCardTipado = CampoCard & { tipo?: string };

const LABELS_MANUAIS: Record<string, string> = Object.fromEntries(
  CAMPOS_CARD_ORCAMENTO.map((c) => [c.key, c.label]),
);

/** "dt_orcamento" → "Dt Orcamento" (usa label manual quando existir). */
export function labelAmigavel(key: string): string {
  if (LABELS_MANUAIS[key]) return LABELS_MANUAIS[key]!;
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

/** Normaliza o retorno da RPC `listar_colunas_tabela` em [{key, tipo}]. */
export function normalizarColunas(data: unknown): { key: string; tipo: string }[] {
  let v = data;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return []; }
  }
  if (Array.isArray(v) && v.length === 1 && v[0] && typeof v[0] === "object" && !Array.isArray(v[0])) {
    const only = v[0] as Row;
    const inner = Object.values(only)[0];
    if (Object.keys(only).length === 1 && (Array.isArray(inner) || (inner && typeof inner === "object"))) v = inner;
  }
  if (Array.isArray(v)) {
    return v
      .map((c) => {
        if (typeof c === "string") return { key: c, tipo: "" };
        const r = c as Row;
        const key = pick<string>(r, ["key", "column_name", "coluna", "nome", "name"]);
        const tipo = pick<string>(r, ["tipo", "data_type", "type", "udt_name"], "");
        return key ? { key: String(key), tipo: String(tipo ?? "") } : null;
      })
      .filter((c): c is { key: string; tipo: string } => !!c);
  }
  if (v && typeof v === "object") {
    return Object.entries(v as Row).map(([key, tipo]) => ({ key, tipo: String(tipo ?? "") }));
  }
  return [];
}

/** Colunas disponíveis para o card, a partir de `funcoes.tabela_base` da função vinculada. */
export async function camposDisponiveisDoVinculo(
  v: VinculoKanban,
): Promise<{ tabela: string | null; campos: CampoCardTipado[] }> {
  const funcaoId = pick(v.row, ["funcao_id", "funcoes_id", "id_funcao"]) ?? colunaCom(v.row, ["func"]);
  if (funcaoId === undefined || funcaoId === null) return { tabela: null, campos: [] };
  let funcao: Row | null = null;
  for (const k of ["funcao_id", "id"]) {
    const { data, error } = await supabase.from("funcoes").select("*").eq(k, funcaoId as never).maybeSingle();
    if (!error && data) { funcao = data as Row; break; }
  }
  const tabela = funcao?.["tabela_base"] ? String(funcao["tabela_base"]).trim() : null;
  if (!tabela) return { tabela: null, campos: [] };
  const { data, error } = await supabase.rpc("listar_colunas_tabela" as never, { nome_tabela: tabela } as never);
  if (error) throw error;
  const campos = normalizarColunas(data).map((c) => ({ key: c.key, label: labelAmigavel(c.key), tipo: c.tipo }));
  return { tabela, campos };
}

/** Lê `campos_card` preservando o `tipo`. */
export function parseCamposCardTipado(v: unknown): CampoCardTipado[] | null {
  let val = v;
  if (typeof val === "string") {
    try { val = JSON.parse(val); } catch { return null; }
  }
  if (!Array.isArray(val)) return null;
  return val
    .filter((c) => c && typeof c === "object" && typeof (c as Row)["key"] === "string")
    .map((c) => {
      const r = c as Row;
      return {
        key: String(r["key"]),
        label: String(r["label"] ?? labelAmigavel(String(r["key"]))),
        ...(r["tipo"] ? { tipo: String(r["tipo"]) } : {}),
      };
    });
}

/** Formatador universal de valores do card. `resolverFk` devolve o nome da entidade relacionada. */
export function formatarValorCard(
  valor: unknown,
  campo: CampoCardTipado,
  resolverFk?: (key: string, valor: unknown) => string | null | undefined,
): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const key = campo.key.toLowerCase();
  const tipo = (campo.tipo ?? "").toLowerCase();
  if (tipo === "boolean" || tipo === "bool" || typeof valor === "boolean") return valor === true || valor === "true" ? "Sim" : "Não";
  if (tipo.startsWith("date") || tipo.startsWith("timestamp") || key.startsWith("dt_") || key.startsWith("data_")) {
    const [y, m, d] = String(valor).slice(0, 10).split("-");
    if (d) return `${d}/${m}/${y}`;
  }
  if (key.endsWith("_id") || key === "id") {
    const nome = resolverFk?.(campo.key, valor);
    if (nome) return nome;
    const s = String(valor);
    return s.length > 8 ? `${s.slice(0, 8)}…` : s;
  }
  if (key.startsWith("total_") || key.startsWith("valor_") || tipo === "numeric" || tipo === "money" || tipo === "decimal") {
    const n = Number(valor);
    if (!Number.isNaN(n)) return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}
