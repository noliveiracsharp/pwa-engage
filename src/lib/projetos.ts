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
    concluida: ["concluida", "concluido", "finalizada", "status"],
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
    path: ["caminho", "path", "storage_path"],
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
