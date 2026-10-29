import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { adicionarAviso } from "@/lib/avisos";
import { linkItemProjeto } from "@/lib/projetos-eventos";
import type { Row } from "@/lib/row";

const INTERVALO = 60 * 1000;

/** Lê os eventos de projeto do usuário logado e grava no sininho (1 aviso por evento). */
export function useAvisosProjetos(usuarioId: unknown) {
  useEffect(() => {
    const uid = String(usuarioId ?? "");
    if (!uid || typeof window === "undefined") return;
    let parado = false;
    const desde = new Date(Date.now() - 7 * 864e5).toISOString();
    const checar = async () => {
      const { data, error } = await supabase.from("projetos_eventos" as never).select("*")
        .eq("usuario_id", uid as never).gte("created_at", desde as never)
        .order("created_at", { ascending: false }).limit(50);
      if (parado || error || !data) return;
      for (const ev of (data as Row[]).reverse()) {
        const acao = String(ev["acao"] ?? "");
        adicionarAviso({
          tipo: "projeto",
          chave: `projeto:${String(ev["id"])}`,
          titulo: acao === "atribuiu" ? `Nova ${String(ev["tipo"] ?? "atividade")} para você` : "Atualização em projeto",
          texto: String(ev["descricao"] ?? ""),
          link: linkItemProjeto(ev["projeto_id"], ev["tarefa_id"]),
        });
      }
    };
    void checar();
    const t = setInterval(() => void checar(), INTERVALO);
    return () => { parado = true; clearInterval(t); };
  }, [usuarioId]);
}
