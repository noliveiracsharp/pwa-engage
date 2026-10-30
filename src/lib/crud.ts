import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";
import { useAuth } from "@/hooks/useAuth";

/** Tabelas globais: nunca filtradas pelo contexto de empresa do Master. */
// "perfil" NÃO é global: cada empresa tem seus perfis (só o Master fica sem empresa).
const GLOBAL_TABLES = new Set(["empresas", "funcoes", "menu", "planos", "modulos", "planos_funcoes", "modulos_funcoes", "planos_base", "modulos_adicionais"]);
/** Tabelas de catálogo que a matriz pode compartilhar com as filiais (só leitura nas filiais). */
const CATALOG_TABLES = new Set(["itens", "marcas", "categorias", "unidades", "centro_custo"]);

/** Reads every row of a table (schema-tolerant: no column names assumed). */
export function useTableRows(table: string, enabled = true, orderBy?: string) {
  const { isMaster, empresa, usuario, loading } = useAuth();
  // Master: empresa do "Contexto da Empresa". Demais perfis: sempre a empresa do próprio usuário.
  const ownEmpresa = usuario ? text(pick(usuario, ["empresa_id", "id_empresa", "empresaid"])) : "";
  // "empresas": Master vê todas; demais perfis só a própria empresa e suas filiais.
  const isEmpresas = table === "empresas";
  const scoped = !GLOBAL_TABLES.has(table) || (isEmpresas && !isMaster);
  const ctx = !scoped ? "" : isMaster ? (empresa ? String(rowId(empresa) ?? "") : "") : ownEmpresa || "__sem_empresa__";
  // Não-Master só consulta depois de saber a empresa, para nunca exibir dados de outras.
  const ready = isMaster || !scoped || (!loading && !!usuario);
  return useQuery({
    queryKey: ctx ? ["table", table, "ctx", ctx] : ["table", table],
    enabled: enabled && ready,
    queryFn: async (): Promise<Row[]> => {
      // Busca em lotes de 1000 até trazer tudo (o banco corta cada resposta em 1000 linhas).
      type Res = { data: unknown; error: { code?: string } | null };
      const base = () => {
        let q = supabase.from(table).select("*");
        if (table === "perfil") q = q.gt("ordem", 0) as typeof q;
        if (orderBy) q = q.order(orderBy, { ascending: true }) as typeof q;
        return q;
      };
      const todos = async (make: (from: number, to: number) => PromiseLike<Res>): Promise<Res> => {
        const PAGE = 1000;
        const out: unknown[] = [];
        for (let from = 0; from < 1_000_000; from += PAGE) {
          const r = await make(from, from + PAGE - 1);
          if (r.error) return r;
          const arr = (r.data ?? []) as unknown[];
          out.push(...arr);
          if (arr.length < PAGE) break;
        }
        return { data: out, error: null };
      };
      // Ordem estável por id garante que nenhuma linha se perca entre os lotes.
      const paged = (q: ReturnType<typeof base>, from: number, to: number) => {
        let qq = q;
        if (!orderBy) qq = qq.order("id", { ascending: true }) as typeof qq;
        return qq.range(from, to) as unknown as PromiseLike<Res>;
      };
      const run = async (filtro?: (q: ReturnType<typeof base>) => ReturnType<typeof base>): Promise<Res> => {
        const r = await todos((f, t) => paged(filtro ? filtro(base()) : base(), f, t));
        // Tabela sem coluna "id": tenta sem a ordenação extra.
        if (r.error && !orderBy) {
          return todos((f, t) => ((filtro ? filtro(base()) : base()).range(f, t) as unknown as PromiseLike<Res>));
        }
        return r;
      };
      let res: Res;
      if (ctx && !isEmpresas && !CATALOG_TABLES.has(table)) {
        res = await run((q) => (isMaster ? q.or(`empresa_id.eq.${ctx},empresa_id.is.null`) : q.eq("empresa_id", ctx)) as typeof q);
        if (res.error) res = await run();
      } else {
        res = await run();
      }
      const { data, error } = res;
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      if (!ctx) return rows;
      if (isEmpresas) return rows.filter((r) => String(rowId(r) ?? "") === ctx || String(r["empresa_pai_id"] ?? "") === ctx);
      // Catálogo compartilhado: filial também vê os itens da matriz quando ela permite.
      let paiCatalogo = "";
      const paiId = empresa ? text(empresa["empresa_pai_id"]) : "";
      if (CATALOG_TABLES.has(table) && paiId) {
        const { data: pai } = await supabase.from("empresas").select("*").eq("id", paiId).maybeSingle();
        if (pai && (pai as Row)["compartilhar_catalogo_filiais"] === true) paiCatalogo = paiId;
      }
      // Master: mantém registros sem empresa (modelos). Demais: só a própria empresa.
      return rows.filter((r) => {
        if (!("empresa_id" in r)) return true;
        if (r["empresa_id"] == null) return isMaster;
        const e = String(r["empresa_id"]);
        return e === ctx || (!!paiCatalogo && e === paiCatalogo);
      });
    },
  });
}

export function rowId(row: Row): string | number | undefined {
  return pick<string | number>(row, ["id", "uuid", "codigo"]);
}

export function idColumn(row: Row | null | undefined): string {
  if (row) {
    for (const key of ["id", "uuid", "codigo"]) if (key in row) return key;
  }
  return "id";
}

export function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

export function matches(value: unknown, term: string) {
  if (!term.trim()) return true;
  return text(value).toLowerCase().includes(term.trim().toLowerCase());
}

/** Insert or update a record, tolerating unknown column layouts. */
export function useSaveRecord(table: string) {
  const queryClient = useQueryClient();
  const { isMaster, empresa } = useAuth();
  return useMutation({
    mutationFn: async ({ values, original }: { values: Row; original?: Row | null }) => {
      if (original) {
        const key = idColumn(original);
        const { error } = await supabase.from(table).update(values).eq(key, original[key] as never);
        if (error) throw error;
      } else {
        const payload: Row = { ...values };
        // Master insere registros diretamente na empresa do contexto.
        if (isMaster && empresa && !GLOBAL_TABLES.has(table) && "empresa_id" in payload) {
          payload["empresa_id"] = rowId(empresa);
        }
        const { error } = await supabase.from(table).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      await atualizarVisoes(queryClient, table);
      toast.success("Registro salvo com sucesso.");
    },
    onError: (error: unknown) => {
      const e = error as { code?: string; message?: string };
      if (e?.code === "23505") {
        const m = String(e.message ?? "");
        toast.error(/documento|cpf|cnpj/i.test(m) ? "Já existe um cadastro com este CNPJ/CPF." : "Já existe um registro com estes dados.");
        return;
      }
      const message = e?.message || "Não foi possível salvar.";
      toast.error(message);
    },
  });
}

export function useDeleteRecord(table: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (row: Row) => {
      const key = idColumn(row);
      const { error } = await supabase.from(table).delete().eq(key, row[key] as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["table", table] });
      toast.success("Registro removido.");
    },
    onError: (error: unknown) => {
      const e = error as { code?: string; message?: string } | null;
      if (e?.code === "23503" || /foreign key|viola/i.test(e?.message ?? ""))
        return void toast.error("Este registro está em uso (Ofertas, Financeiro ou outro cadastro) e não pode ser apagado. Inative-o.");
      toast.error(e?.message || "Não foi possível remover.");
    },
  });
}

/**
 * Depois de gravar: recarrega a tabela e marca como desatualizados os painéis derivados
 * (visão geral, dashboards, kanban, relatórios), que usam chaves próprias e não viam a mudança.
 */
export async function atualizarVisoes(qc: import("@tanstack/react-query").QueryClient, ...tabelas: string[]) {
  await Promise.all(tabelas.map((t) => qc.invalidateQueries({ queryKey: ["table", t] })));
  void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "table" });
}
