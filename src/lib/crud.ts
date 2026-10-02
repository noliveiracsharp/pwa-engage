import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";
import { useAuth } from "@/hooks/useAuth";

/** Tabelas globais: nunca filtradas pelo contexto de empresa do Master. */
const GLOBAL_TABLES = new Set(["empresas", "funcoes", "perfil", "menu", "planos", "modulos", "planos_funcoes", "modulos_funcoes", "planos_base", "modulos_adicionais"]);

/** Reads every row of a table (schema-tolerant: no column names assumed). */
export function useTableRows(table: string, enabled = true, orderBy?: string) {
  const { isMaster, empresa } = useAuth();
  const ctx = isMaster && !GLOBAL_TABLES.has(table) && empresa ? String(rowId(empresa) ?? "") : "";
  return useQuery({
    queryKey: ctx ? ["table", table, "ctx", ctx] : ["table", table],
    enabled,
    queryFn: async (): Promise<Row[]> => {
      let q = supabase.from(table).select("*");
      // Anti-escalonamento: o perfil Master (ordem 0) nunca aparece em listas/selects.
      if (table === "perfil") q = q.gt("ordem", 0) as typeof q;
      if (orderBy) q = q.order(orderBy, { ascending: true }) as typeof q;
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      // Master: mostra só os dados da empresa escolhida no "Contexto da Empresa".
      if (ctx) return rows.filter((r) => !("empresa_id" in r) || r["empresa_id"] == null || String(r["empresa_id"]) === ctx);
      return rows;
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["table", table] });
      toast.success("Registro salvo com sucesso.");
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Não foi possível salvar.";
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
      toast.error(error instanceof Error ? error.message : "Não foi possível remover.");
    },
  });
}
