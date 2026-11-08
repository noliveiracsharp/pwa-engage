import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getAllowedPathsCached } from "@/lib/access";
import { pick } from "@/lib/row";
import { AMBIENTE_KEY, montarAmbientes, type Ambiente, type VinculoAcesso } from "@/lib/ambientes";

const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>;
const SEMPRE = ["/meus-dados", "/sem-acesso", "/acesso", "/minha-unidade"];

/** Ambientes do login atual: gestão da empresa (se tem telas liberadas) + unidades vinculadas. */
export function useAmbientes() {
  const { user, empresaOriginal, isMaster } = useAuth();
  return useQuery({
    queryKey: ["ambientes", user?.id ?? "", empresaOriginal ? String(empresaOriginal["id"]) : ""],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<Ambiente[]> => {
      const allowed = (await getAllowedPathsCached(user!.id, user!.email ?? undefined)) ?? [];
      const temGestao = isMaster || allowed.some((p) => !SEMPRE.includes(p));
      const { data, error } = await rpc("cond_meus_acessos");
      const vinculos = error ? [] : ((data ?? []) as VinculoAcesso[]);
      const nome = pick<string>(empresaOriginal, ["nome_fantasia", "razao_social", "nome"], "Minha empresa");
      return montarAmbientes(temGestao ? { nome: nome ?? "Minha empresa", perfil: "Gestão da empresa" } : null, vinculos);
    },
  });
}

export const lerAmbiente = () => (typeof window === "undefined" ? null : localStorage.getItem(AMBIENTE_KEY));
export const gravarAmbiente = (id: string) => localStorage.setItem(AMBIENTE_KEY, id);
