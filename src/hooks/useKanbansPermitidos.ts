import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { pick, type Row } from "@/lib/row";
import { kanbanPermitido, type VinculoPerfilKanban } from "@/lib/kanban-acesso";

/** Retorna uma função que diz se o perfil logado pode ver um quadro. */
export function useKanbansPermitidos() {
  const { usuario, isMaster } = useAuth();
  const perfilId = pick(usuario, ["perfil_id", "id_perfil"]);
  const perfil = perfilId === undefined || perfilId === null ? null : String(perfilId);
  const q = useQuery({
    queryKey: ["table", "perfil_kanban"],
    enabled: !isMaster && !!usuario,
    queryFn: async (): Promise<VinculoPerfilKanban[]> => {
      const { data, error } = await supabase.from("perfil_kanban" as never).select("kanban_nome_id, perfil_id");
      if (error) throw error;
      return ((data ?? []) as Row[]).map((r) => ({
        kanban_nome_id: String(r["kanban_nome_id"]),
        perfil_id: String(r["perfil_id"]),
      }));
    },
  });
  const vinculos = q.data ?? [];
  return {
    isLoading: !isMaster && (!usuario || q.isLoading),
    pode: (kanbanId: unknown) => kanbanPermitido(String(kanbanId), perfil, vinculos, isMaster),
  };
}
