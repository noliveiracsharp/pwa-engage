import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { pick, type Row } from "@/lib/row";
import { Button } from "@/components/ui/button";
import { PlannerPainel } from "@/components/chat-interno/PlannerPainel";
import { TarefasChat, NovaTarefa } from "@/components/chat-interno/TarefasChat";
import { canalDireto } from "@/components/chat-interno/ChatInterno";

export const Route = createFileRoute("/_authenticated/planner")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Planner — Atende.ai" },
      { name: "description", content: "Planejamento semanal de tarefas, delegação com aceite e reuniões da equipe." },
      { property: "og:title", content: "Planner — Atende.ai" },
      { property: "og:description", content: "Planejamento semanal de tarefas, delegação com aceite e reuniões da equipe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlannerPagina,
});

function PlannerPagina() {
  const { usuario } = useAuth();
  const me = String(pick(usuario, ["id"]) ?? "");
  const empresaId = String(pick(usuario, ["empresa_id", "id_empresa"]) ?? "");
  const qc = useQueryClient();
  const [criando, setCriando] = useState(false);

  const { data: usuarios = [] } = useQuery({
    queryKey: ["chat-interno-usuarios", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase.from("usuarios").select("*").eq("empresa_id", empresaId);
      if (error) throw error;
      return ((data ?? []) as Row[]).filter((u) => String(u["id"]) !== me && u["status"] !== false);
    },
  });

  const avisar = async (outroId: string, texto: string) => {
    const canal = await canalDireto(me, outroId, empresaId);
    await supabase.from("chat_interno_mensagens").insert({ empresa_id: empresaId, canal_id: canal, remetente_id: me, mensagem: texto, anexos: [], lida_por: [me] });
  };

  if (!me) return null;
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[360px_1fr]">
      <div className="flex h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-xl border border-border bg-card">
        <TarefasChat me={me} empresaId={empresaId} usuarios={usuarios} onAvisar={avisar} />
      </div>
      <PlannerPainel embutido me={me} empresaId={empresaId} usuarios={usuarios}
        acoes={<Button size="sm" onClick={() => setCriando(true)}><Plus className="mr-1 h-4 w-4" /> Nova tarefa</Button>} />
      {criando && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-foreground/30" onClick={() => setCriando(false)}>
          <div className="h-full w-full overflow-y-auto bg-background md:w-[60%]" onClick={(e) => e.stopPropagation()}>
            <NovaTarefa me={me} empresaId={empresaId} usuarios={usuarios} onCancel={() => setCriando(false)} onSaved={async (resp, titulo) => {
              setCriando(false);
              void qc.invalidateQueries({ queryKey: ["tarefas-usuarios", me] });
              void qc.invalidateQueries({ queryKey: ["planner", me] });
              if (resp !== me) await avisar(resp, `📋 Nova tarefa para você: "${titulo}". Abra o Planner para aceitar ou recusar.`).catch(() => undefined);
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
