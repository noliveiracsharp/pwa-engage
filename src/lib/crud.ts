import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";

/** Reads every row of a table (schema-tolerant: no column names assumed). */
export function useTableRows(table: string, enabled = true, orderBy?: string) {
  return useQuery({
    queryKey: ["table", table],
    enabled,
    queryFn: async (): Promise<Row[]> => {
      let q = supabase.from(table).select("*");
      if (orderBy) q = q.order(orderBy, { ascending: true }) as typeof q;
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
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
  return useMutation({
    mutationFn: async ({ values, original }: { values: Row; original?: Row | null }) => {
      if (original) {
        const key = idColumn(original);
        const { error } = await supabase.from(table).update(values).eq(key, original[key] as never);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table).insert(values);
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
