import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";
import { useAuth } from "@/hooks/useAuth";
import { empresaDaConsulta } from "@/lib/financeiro-contexto";

/** Tarefas de Projetos pela procedure fn_projetos_tarefas_lista (abertas + concluídas recentes + a tarefa do link).
 *  Mantém o prefixo ["table","projetos_tarefas"] para as invalidações existentes. Sem o script, cai na leitura direta. */
export function useTarefasProjetos(incluirConcluidas: boolean, tarefaId?: string) {
  const { isMaster, empresa, usuario, loading, escopoFinanceiro } = useAuth();
  const own = usuario ? String(pick(usuario, ["empresa_id", "id_empresa", "empresaid"]) ?? "") : "";
  const ctx = empresaDaConsulta(escopoFinanceiro, isMaster, empresa ? String(empresa["id"] ?? "") : "", own);
  return useQuery({
    queryKey: ["table", "projetos_tarefas", "rpc", ctx, incluirConcluidas, tarefaId ?? ""],
    enabled: !loading && !!usuario,
    queryFn: async (): Promise<Row[]> => {
      const out: Row[] = [];
      for (let de = 0; ; de += 1000) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.rpc as any)("fn_projetos_tarefas_lista", {
          p_incluir_concluidas: incluirConcluidas, p_dias: 15, p_tarefa_id: tarefaId || null, p_empresa_id: ctx || null,
        }).range(de, de + 999);
        if (error) {
          if (de === 0 && /fn_projetos_tarefas_lista|PGRST202|function/i.test(`${error.code} ${error.message}`)) return leituraDireta(ctx);
          throw new Error(error.message);
        }
        const lote = (data ?? []) as Row[];
        out.push(...lote);
        if (lote.length < 1000) return out;
      }
    },
  });
}

async function leituraDireta(ctx: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let de = 0; ; de += 1000) {
    let q = supabase.from("projetos_tarefas").select("*");
    if (ctx) q = q.eq("empresa_id", ctx as never);
    const { data, error } = await q.range(de, de + 999);
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as Row[];
    out.push(...lote);
    if (lote.length < 1000) return out;
  }
}
