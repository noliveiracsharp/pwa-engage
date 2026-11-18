import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Quantidade de assembleias ao vivo (em andamento ou sessão permanente) — alimenta o badge vermelho do menu. */
export function useAssembleiasAoVivo(condominioId: string | null | undefined): number {
  const { data = 0 } = useQuery({
    queryKey: ["cond", "assembleias-ao-vivo", condominioId],
    enabled: !!condominioId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count, error } = await db.from("cond_assembleias").select("id", { count: "exact", head: true })
        .eq("condominio_id", condominioId).in("status", ["em_andamento", "sessao_permanente"]);
      if (error) return 0;
      return count ?? 0;
    },
  });
  return data;
}
