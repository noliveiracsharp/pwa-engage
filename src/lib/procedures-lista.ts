import { supabase } from "@/integrations/supabase/client";

/** Tabelas lidas pela procedure `fn_lista_<tabela>` (supabase/sql/conectcon-ofertas-kanban-procedures.sql).
 *  A procedure retorna as linhas da tabela; filtros, ordem e paginação seguem aplicados sobre ela. */
export const TABELAS_PROCEDURE = new Set(["parceiros", "usuarios", "itens", "unidade_medida", "itens_marcas", "empresas", "kanban_nome", "kanban_etapas", "cotacoes",
  "financeiro_titulos", "financeiro_titulos_itens", "orcamento_itens", "pedidos_compra_itens", "cobranca_regua", "cobranca_envios"]);

/** Procedures ainda não instaladas no banco: usa a leitura antiga até o script rodar. */
const indisponiveis = new Set<string>();

export function procedureDaTabela(tabela: string): string | null {
  const fn = `fn_lista_${tabela}`;
  return !indisponiveis.has(fn) ? fn : null;
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

/** Lê pela procedure da tabela aplicando filtros; se a procedure ainda não existe no banco, repete pela tabela. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function lerTabela(tabela: string, montar: (q: any) => any): Promise<{ data: any; error: any }> {
  const { fn, q } = consultaTabela(tabela);
  let r = await montar(q);
  if (fn && r.error) { procedureAusente(fn, r.error); r = await montar(supabase.from(tabela as never).select("*")); }
  return r;
}

/** Leitura encadeável pela procedure da tabela (mesma API de filtros do supabase-js: .eq/.in/.order/.maybeSingle...).
 *  Os filtros são gravados e aplicados ao executar; sem a procedure no banco, repete pela tabela. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tabelaLeitura(tabela: string): any {
  const ops: [PropertyKey, unknown[]][] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const montar = (base: any) => ops.reduce((q, [m, a]) => q[m](...a), base);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proxy: any = new Proxy({}, {
    get(_, prop) {
      if (prop === "then") return (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => lerTabela(tabela, montar).then(ok, falha);
      return (...args: unknown[]) => { ops.push([prop, args]); return proxy; };
    },
  });
  return proxy;
}
