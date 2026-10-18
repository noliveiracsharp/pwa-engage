import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type AuditoriaLog, resumoLog } from "@/lib/auditoria";
import { AuditoriaDetalhe, OperacaoBadge } from "./AuditoriaDetalhe";

const db = supabase as any;

/** Botão "Histórico": linha do tempo de um registro (quem criou/alterou e quando). */
export function HistoricoButton({ tabela, registroId }: { tabela: string; registroId: string | number | undefined | null }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<AuditoriaLog | null>(null);
  const id = registroId == null ? "" : String(registroId);
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["auditoria", tabela, id],
    enabled: open && !!id,
    queryFn: async () => {
      const { data, error } = await db.from("auditoria_logs").select("*")
        .eq("tabela", tabela).eq("registro_id", id).order("criado_em", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as AuditoriaLog[];
    },
  });
  if (!id) return null;
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} className="gap-1">
        <History className="h-4 w-4" /> Histórico
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          <DialogHeader><DialogTitle>Histórico do registro</DialogTitle></DialogHeader>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : error ? (
            <p className="text-sm text-muted-foreground">Histórico indisponível para o seu perfil.</p>
          ) : data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma ação registrada ainda.</p>
          ) : (
            <ol className="space-y-2 border-l pl-4">
              {data.map((l) => (
                <li key={l.id}>
                  <button type="button" onClick={() => setSel(l)} className="w-full rounded-md p-2 text-left hover:bg-muted">
                    <div className="flex items-center gap-2 text-sm">
                      <OperacaoBadge op={l.operacao} />
                      <span className="font-medium">{l.usuario_nome ?? "Sistema"}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{new Date(l.criado_em).toLocaleString("pt-BR")}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{resumoLog(l)}</p>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>
      <AuditoriaDetalhe log={sel} onClose={() => setSel(null)} />
    </>
  );
}
