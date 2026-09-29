import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const TABLES = [
  "empresas",
  "pessoas",
  "pessoas_camposperson",
  "usuarios",
  "funcoes",
  "perfil",
  "menu",
  "kanban",
  "kanban_etapas",
  "atendimentos",
  "empresas_instancias",
  "empresas_camposperson",
  "empresas_notasrapidas",
];

/**
 * Subscribes to Supabase Realtime so any insert/update/delete on the app's
 * tables invalidates TanStack Query and the UI refreshes immediately,
 * no matter where the change came from (another user, another tab, SQL).
 */
export function useRealtimeRefresh() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("atendeai-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public" },
        (payload) => {
          const table = (payload as { table?: string }).table;
          if (table) {
            queryClient.invalidateQueries({ queryKey: ["table", table] });
          } else {
            queryClient.invalidateQueries({ queryKey: ["table"] });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

export { TABLES as REALTIME_TABLES };
