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

/** ID da etapa do kanban cuja descrição é exatamente a situação informada. */
export async function etapaPorDescricao(
  kanbanNomeId: string | null,
  descricao: string,
): Promise<string | null> {
  if (!kanbanNomeId) return null;
  const { data } = await supabase.from("kanban_etapas").select("*").eq("descricao", descricao);
  const e = ((data ?? []) as Row[]).find(
    (r) => String(pick(r, ETAPA_KANBAN_KEYS) ?? "") === kanbanNomeId,
  );
  return e ? String(e["id"]) : null;
}

/**
 * Completa o cabeçalho com `kanban_nome_id`/`kanban_etapa_id` coerentes com a situação.
 * Mantém o kanban já gravado; senão descobre pelo módulo.
 */
export async function vincularKanban(header: Row, original: Row | null): Promise<Row> {
  const situacao = String(header["situacao"] ?? "Em andamento");
  let kanbanId = original?.["kanban_nome_id"] ? String(original["kanban_nome_id"]) : null;
  if (!kanbanId) kanbanId = await kanbanDoModuloOrcamentos();
  if (!kanbanId) return header;
  if (header["kanban_etapa_id"]) return { ...header, kanban_nome_id: kanbanId };
  const etapaId = await etapaPorDescricao(kanbanId, situacao);
  return {
    ...header,
    kanban_nome_id: kanbanId,
    ...(etapaId ? { kanban_etapa_id: etapaId } : {}),
  };
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
