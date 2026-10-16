import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ModuloPublico = { id: string; nome: string; descricao: string; valor: number };

/** Módulos adicionais ativos, ordenados por preço (Landing e Checkout). */
export function useModulosPublicos() {
  return useQuery({
    queryKey: ["modulos-publicos"],
    queryFn: async (): Promise<ModuloPublico[]> => {
      const { data, error } = await supabase.from("modulos_adicionais" as never).select("*");
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[])
        .filter((m) => m["status"] !== false && m["ativo"] !== false)
        .map((m) => ({
          id: String(m["id"]),
          nome: String(m["nome"] ?? ""),
          descricao: String(m["descricao"] ?? ""),
          valor: Number(m["valor_mensal_fixo"] ?? m["valor_mensal"] ?? 0),
        }))
        .sort((a, b) => a.valor - b.valor);
    },
  });
}
