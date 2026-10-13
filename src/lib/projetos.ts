import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizarColunas } from "@/lib/orcamento-kanban";
import { pick, type Row } from "@/lib/row";

/** Colunas reais da tabela (via RPC listar_colunas_tabela). */
export function useCols(table: string) {
  return useQuery({
    queryKey: ["rpc", "listar_colunas_tabela", table],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.rpc(
        "listar_colunas_tabela" as never,
        { nome_tabela: table } as never,
      );
      if (error) return [];
      return normalizarColunas(data).map((c) => c.key);
    },
  });
}

/** Resolve o nome de coluna entre candidatos, usando colunas reais ou chaves das linhas. */
export function resolveCol(cols: string[] | undefined, rows: Row[], cands: string[]): string {
  const set = new Set(cols ?? []);
  for (const r of rows) for (const k of Object.keys(r)) set.add(k);
  return cands.find((c) => set.has(c)) ?? cands[0]!;
}

/** Remove do payload chaves que não existem na tabela (quando a estrutura é conhecida). */
export function filterPayload(payload: Row, cols: string[] | undefined): Row {
  if (!cols || cols.length === 0) return payload;
  const set = new Set(cols);
  return Object.fromEntries(Object.entries(payload).filter(([k]) => set.has(k)));
}

export const C = {
  status: { nome: ["descricao", "nome"], ordem: ["ordem", "posicao"], cor: ["cor_hex", "cor"] },
  projeto: {
    nome: ["nome", "descricao", "titulo"],
    status: ["projetos_status_id", "projeto_status_id", "status_id"],
    parceiro: ["parceiro_id", "parceiros_id", "cliente_id"],
    descricao: ["descricao", "observacao"],
    dtInicio: ["dt_inicio", "data_inicio"],
    dtFim: ["dt_fim", "data_fim", "dt_previsao"],
  },
  tarefa: {
    projeto: ["projeto_id", "projetos_id"],
    nome: ["nome", "titulo", "descricao"],
    descricao: ["descricao", "detalhe", "observacao"],
    responsavel: ["usuario_id", "responsavel_id", "usuarios_id"],
    dtInicio: ["dt_inicio", "data_inicio"],
    dtFim: ["dt_fim", "data_fim", "dt_prazo"],
    prioridade: ["prioridade"],
    concluida: ["situacao", "concluida", "concluido", "finalizada", "status"],
    progresso: ["progresso"],
  },
  check: {
    tarefa: ["tarefa_id", "projetos_tarefas_id", "projeto_tarefa_id"],
    descricao: ["descricao", "nome", "titulo"],
    concluido: ["concluido", "concluida", "status"],
  },
  dep: {
    tarefa: ["tarefa_id", "projetos_tarefas_id", "projeto_tarefa_id"],
    depende: ["depende_de_id", "tarefa_dependencia_id", "dependencia_id", "depende_tarefa_id"],
  },
  anexo: {
    tarefa: ["tarefa_id", "projetos_tarefas_id", "projeto_tarefa_id"],
    nome: ["nome_arquivo", "nome", "descricao"],
    url: ["url", "arquivo_url", "link"],
    path: ["caminho_storage", "caminho", "path", "storage_path"],
    tamanho: ["tamanho", "tamanho_bytes", "size"],
    tipo: ["tipo", "mime_type", "content_type"],
  },
};

export const PRIORIDADES = ["Urgente", "Alta", "Normal", "Baixa"] as const;

export function prioridadeClass(p: unknown): string {
  const v = String(p ?? "").toLowerCase();
  if (v.startsWith("urg")) return "bg-destructive text-destructive-foreground";
  if (v.startsWith("alt")) return "bg-warning text-warning-foreground";
  if (v.startsWith("baix")) return "bg-muted text-muted-foreground";
  return "bg-primary text-primary-foreground";
}

export function isDone(v: unknown): boolean {
  if (v === true || v === 1) return true;
  const s = String(v ?? "").toLowerCase();
  return s === "true" || s === "1" || s.startsWith("conclu") || s.startsWith("finaliz");
}

/** Valor a gravar para "concluído", respeitando coluna texto ou booleana. */
export function doneValue(col: string, done: boolean): unknown {
  if (col === "situacao") return done ? "Concluída" : "Em andamento";
  return col === "status" ? (done ? "Concluída" : "Pendente") : done;
}

export function fmtDate(v: unknown): string {
  if (!v) return "—";
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split("-");
  return y && m && d ? `${d}/${m}/${y}` : s;
}

export function nomePessoa(r: Row | undefined): string {
  return String(pick(r, ["nome_fantasia", "razao_social", "nome", "email"]) ?? "—");
}

/** Progresso 0-100 da tarefa: usa a coluna progresso; sem ela, concluída = 100. */
export function tarefaPct(t: Row, doneCol?: string): number {
  const n = Number(t["progresso"]);
  if (t["progresso"] !== null && t["progresso"] !== undefined && !isNaN(n)) return Math.max(0, Math.min(100, Math.round(n)));
  return isDone(doneCol ? t[doneCol] : pick(t, C.tarefa.concluida)) ? 100 : 0;
}

/** Payload de progresso com automação da situação (100 → Concluída; saiu de 100 → Em andamento). */
export function progressoPayload(pct: number, anterior: number): Row {
  const p: Row = { progresso: pct };
  if (pct >= 100) p["situacao"] = "Concluída";
  else if (anterior >= 100) p["situacao"] = "Em andamento";
  return p;
}

/** Cor da escala de progresso (0/25/50/75/100) como variável de tema. */
export function progressoCor(pct: number): string {
  const faixa = pct >= 100 ? 100 : pct >= 75 ? 75 : pct >= 50 ? 50 : pct >= 25 ? 25 : 0;
  return `var(--progress-${faixa})`;
}

/** Período "dd/mm/aaaa a dd/mm/aaaa" só com as datas existentes; vazio se nenhuma. */
export function periodo(ini: unknown, fim: unknown): string {
  const a = ini ? fmtDate(ini) : "";
  const b = fim ? fmtDate(fim) : "";
  if (a && b) return `${a} a ${b}`;
  if (a) return `Início ${a}`;
  if (b) return `Até ${b}`;
  return "";
}

export const ATIVIDADES = "projetos_atividades";
export const ATIV_DEPS = "projetos_atividades_dependencias";

/** Progresso 0-100 de uma atividade. */
export function atividadePct(a: Row): number {
  const n = Number(a["progresso"]);
  if (!isNaN(n) && a["progresso"] !== null && a["progresso"] !== undefined) return Math.max(0, Math.min(100, Math.round(n)));
  return isDone(a["situacao"]) ? 100 : 0;
}

/** Média do progresso das atividades (null se não houver nenhuma). */
export function mediaAtividades(ativs: Row[]): number | null {
  if (!ativs.length) return null;
  return Math.round(ativs.reduce((s, a) => s + atividadePct(a), 0) / ativs.length);
}

/** Recalcula e grava o progresso da tarefa a partir das suas atividades. */
export async function sincronizarTarefa(tarefaId: string, tCols?: string[]): Promise<void> {
  const { data } = await supabase.from(ATIVIDADES as never).select("progresso, situacao").eq("tarefa_id", tarefaId as never);
  const media = mediaAtividades((data ?? []) as Row[]);
  if (media === null) return;
  const payload: Row = { progresso: media, situacao: media >= 100 ? "Concluída" : "Em andamento" };
  await supabase.from("projetos_tarefas").update(filterPayload(payload, tCols?.length ? [...tCols, "progresso"] : tCols) as never).eq("id", tarefaId as never);
}

const CHECKLISTS = "projetos_tarefas_checklists";
const SEM_COPIA = ["id", "created_at", "updated_at", "criado_em", "atualizado_em", "token_compartilhamento"];
function limpar(r: Row): Row {
  const c: Row = { ...r };
  for (const k of SEM_COPIA) delete c[k];
  return c;
}

/** Copia uma atividade (com checklist) para a tarefa informada, no fim da lista. */
export async function duplicarAtividade(a: Row, tarefaId: string, sufixo = " (Cópia)"): Promise<string> {
  const { data: irmas } = await supabase.from(ATIVIDADES as never).select("ordem").eq("tarefa_id", tarefaId as never);
  const ordem = ((irmas ?? []) as Row[]).reduce((m, x) => Math.max(m, Number(x["ordem"] ?? 0)), -1) + 1;
  const { data, error } = await supabase.from(ATIVIDADES as never)
    .insert({ ...limpar(a), tarefa_id: tarefaId, nome: `${String(a["nome"] ?? "")}${sufixo}`, ordem } as never).select("id").single();
  if (error) throw error;
  const novoId = String((data as Row)["id"]);
  const { data: itens } = await supabase.from(CHECKLISTS).select("*").eq("atividade_id", String(a["id"]) as never);
  if (itens?.length) {
    const novos = (itens as Row[]).map((i) => {
      const c = limpar(i);
      for (const k of C.check.tarefa) if (k in c) c[k] = tarefaId;
      c["atividade_id"] = novoId;
      return c;
    });
    const { error: e2 } = await supabase.from(CHECKLISTS).insert(novos as never);
    if (e2) throw e2;
  }
  return novoId;
}

/** Copia uma tarefa com todas as atividades e checklists, no fim do projeto. */
export async function duplicarTarefa(t: Row, nomeCol: string, ordem: number): Promise<void> {
  const { data, error } = await supabase.from("projetos_tarefas")
    .insert({ ...limpar(t), [nomeCol]: `${String(t[nomeCol] ?? "")} (Cópia)`, ordem } as never).select("id").single();
  if (error) throw error;
  const novoId = String((data as Row)["id"]);
  const { data: ativs } = await supabase.from(ATIVIDADES as never).select("*").eq("tarefa_id", String(t["id"]) as never).order("ordem");
  for (const a of (ativs ?? []) as Row[]) await duplicarAtividade(a, novoId, "");
}
