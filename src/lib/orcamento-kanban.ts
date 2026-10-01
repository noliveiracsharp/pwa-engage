import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";
import { SITUACOES } from "@/lib/orcamentos";

const ETAPA_KANBAN_KEYS = ["kanban_nome_id", "kanban_id", "id_kanban"];

/** Situações válidas do CHECK de `orcamentos.situacao`. */
export function isSituacaoValida(v: unknown): v is string {
  return SITUACOES.some((s) => s.value === String(v ?? "").trim());
}

/** Descobre o kanban vinculado ao módulo de Orçamentos via `funcoes_kanban`. */
export async function kanbanDoModuloOrcamentos(): Promise<string | null> {
  const { data: funcoes } = await supabase.from("funcoes").select("*").eq("path", "/orcamentos");
  const ids = ((funcoes ?? []) as Row[]).map((f) => String(f["id"]));
  if (!ids.length) return null;
  const { data: vinculos } = await supabase.from("funcoes_kanban").select("*");
  const v = ((vinculos ?? []) as Row[]).find((r) =>
    ids.includes(String(pick(r, ["funcoes_id", "funcao_id", "id_funcao"]) ?? "")),
  );
  const k = v ? pick(v, ["kanban_nome_id", "kanban_id"]) : undefined;
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
  const etapaId = await etapaPorDescricao(kanbanId, situacao);
  return {
    ...header,
    kanban_nome_id: kanbanId,
    ...(etapaId ? { kanban_etapa_id: etapaId } : {}),
  };
}
