import { supabase } from "@/integrations/supabase/client";

/** Tabelas lidas pela procedure `fn_lista_<tabela>` (supabase/sql/conectcon-ofertas-kanban-procedures.sql).
 *  A procedure retorna as linhas da tabela; filtros, ordem e paginação seguem aplicados sobre ela. */
const TABELAS_PROCEDURE = new Set(["parceiros", "usuarios", "itens", "unidade_medida", "itens_marcas", "empresas", "kanban_nome", "kanban_etapas", "cotacoes"]);

/** Procedures ainda não instaladas no banco: usa a leitura antiga até o script rodar. */
const indisponiveis = new Set<string>();

export function procedureDaTabela(tabela: string): string | null {
  const fn = `fn_lista_${tabela}`;
  return TABELAS_PROCEDURE.has(tabela) && !indisponiveis.has(fn) ? fn : null;
}

/** Erro de procedure inexistente: marca para não tentar de novo e indica que pode repetir pela tabela. */
export function procedureAusente(fn: string | null, error: { code?: string; message?: string } | null | undefined): boolean {
  if (!fn || !error) return false;
  const ausente = error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message ?? "");
  if (ausente) indisponiveis.add(fn);
  return ausente;
}

/** Consulta-base da tabela: pela procedure quando disponível. Aceita .eq/.in/.or/.order/.range. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function consultaTabela(tabela: string): { fn: string | null; q: any } {
  const fn = procedureDaTabela(tabela);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return fn ? { fn, q: (supabase.rpc as any)(fn) } : { fn: null, q: supabase.from(tabela).select("*") };
}

/** Lê todas as linhas de uma procedure em lotes de 1000. Retorna null se ela não existir no banco. */
export async function lerProcedure<T = Record<string, unknown>>(fn: string, args: Record<string, unknown>): Promise<T[] | null> {
  if (indisponiveis.has(fn)) return null;
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)(fn, args).range(de, de + 999);
    if (error) {
      if (procedureAusente(fn, error)) return null;
      throw new Error(error.message);
    }
    const lote = (data ?? []) as T[];
    out.push(...lote);
    if (lote.length < 1000) return out;
  }
}
