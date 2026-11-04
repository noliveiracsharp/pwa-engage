import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Inbox, Plus, X } from "lucide-react";
import { SolicitarLaudoDialog } from "@/components/laudos/SolicitarLaudoDialog";
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
  const [criando, setCriando] = useState<string | false>(false);
  const [aceites, setAceites] = useState(false);
  const [laudo, setLaudo] = useState(false);
  const { data: pendentes = 0 } = useQuery({
    queryKey: ["tarefas-usuarios", me, "pendentes"],
    enabled: !!me,
    refetchInterval: 30000,
    queryFn: async () => {
      const { count } = await (supabase.from("tarefas_usuarios" as never) as unknown as ReturnType<typeof supabase.from>)
        .select("id", { count: "exact", head: true }).eq("responsavel_id", me).eq("status", "aguardando");
      return count ?? 0;
    },
  });

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
    <div className="p-4">
      <PlannerPainel embutido onAvisar={avisar} onNovaTarefa={(d) => setCriando(d)} me={me} empresaId={empresaId} usuarios={usuarios}
        acoes={<>
          <Button size="sm" variant={pendentes ? "default" : "outline"} onClick={() => setAceites(true)}>
            <Inbox className="mr-1 h-4 w-4" /> Aguardando aceite{pendentes ? ` (${pendentes})` : ""}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLaudo(true)}><ClipboardCheck className="mr-1 h-4 w-4" /> Laudo técnico</Button>
          <Button size="sm" onClick={() => setCriando("")}><Plus className="mr-1 h-4 w-4" /> Nova tarefa</Button>
        </>} />
      <SolicitarLaudoDialog open={laudo} onOpenChange={setLaudo} usuarios={usuarios} me={me} onAvisar={avisar} />
      {aceites && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-foreground/30" onClick={() => setAceites(false)}>
          <div className="flex h-full w-full flex-col overflow-hidden bg-background md:w-[60%]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border p-3">
              <h2 className="font-semibold">Tarefas e delegações</h2>
              <Button size="icon" variant="ghost" aria-label="Fechar" onClick={() => setAceites(false)}><X className="h-5 w-5" /></Button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <TarefasChat me={me} empresaId={empresaId} usuarios={usuarios} onAvisar={avisar} />
            </div>
          </div>
        </div>
      )}
      {criando !== false && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-foreground/30" onClick={() => setCriando(false)}>
          <div className="h-full w-full overflow-y-auto bg-background md:w-[60%]" onClick={(e) => e.stopPropagation()}>
            <NovaTarefa dataInicial={criando || undefined} me={me} empresaId={empresaId} usuarios={usuarios} onCancel={() => setCriando(false)} onSaved={async (resp, titulo) => {
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
