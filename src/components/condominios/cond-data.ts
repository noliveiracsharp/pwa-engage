import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Row } from "@/lib/row";

/** Lê linhas de uma tabela condominial filtrando por uma coluna (ex.: condominio_id). */
export function useCondRows(table: string, coluna: string, valor: string | undefined, ordem?: string) {
  return useQuery({
    queryKey: ["cond", table, coluna, valor ?? ""],
    enabled: !!valor,
    queryFn: async (): Promise<Row[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = (supabase as any).from(table).select("*").eq(coluna, valor);
      if (ordem) q = q.order(ordem, { ascending: true });
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
}

/** Catálogo global (marcas, modelos, cores de veículos). */
export function useCatalogo(table: string) {
  return useQuery({
    queryKey: ["cond", "catalogo", table],
    queryFn: async (): Promise<Row[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from(table).select("*").eq("status", true).order("descricao");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
}

/** Grava (insert/update) ou exclui e atualiza o cache condominial. */
export function useCondSalvar(table: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, valores, excluir }: { id?: string; valores?: Row; excluir?: boolean }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = (supabase as any).from(table);
      const r = excluir ? await t.delete().eq("id", id) : id ? await t.update(valores).eq("id", id) : await t.insert(valores);
      if (r.error) throw r.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cond", table] }),
    onError: (e: { message?: string; code?: string }) =>
      toast.error(e.code === "23505" ? "Já existe um registro com essa identificação." : e.message || "Não foi possível salvar."),
  });
}

export const PAPEIS = [
  { value: "proprietario", label: "Proprietário" },
  { value: "inquilino", label: "Inquilino" },
  { value: "familiar", label: "Familiar" },
  { value: "preposto", label: "Procurador / preposto" },
  { value: "prestador", label: "Prestador de serviço" },
  { value: "colaborador", label: "Colaborador" },
  { value: "visitante", label: "Visitante da unidade" },
];

export const OCUPACOES = [
  { value: "alugada", label: "Alugada (inquilino reside)" },
  { value: "propria", label: "Própria (proprietário reside)" },
  { value: "vazia", label: "Vazia" },
];

export const MODALIDADES_VAGA = [
  { value: "privativa", label: "Privativa (escritura — não sorteia)" },
  { value: "rotativa", label: "Rotativa" },
  { value: "sorteada", label: "Sorteada" },
  { value: "visitante", label: "Visitante" },
];

export const TIPOS_UNIDADE = [
  { value: "apartamento", label: "Apartamento" },
  { value: "casa", label: "Casa" },
  { value: "cobertura", label: "Cobertura" },
  { value: "loja", label: "Loja" },
  { value: "sala", label: "Sala" },
  { value: "vaga_autonoma", label: "Vaga autônoma" },
  { value: "outro", label: "Outro" },
];

export const s = (v: unknown) => (v == null ? "" : String(v));

/** Ordena números de unidade de forma natural (101, 102, 1001…). */
export const ordemNatural = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
