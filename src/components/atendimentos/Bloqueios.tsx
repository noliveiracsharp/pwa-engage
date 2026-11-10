import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Search, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { confirmar } from "@/components/layout/DialogoGlobal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tb = (n: string) => (supabase as any).from(n);
const SCRIPT = "Rode o script atendeai-sla-jornada-e-bloqueios.sql no banco.";
const faltaTabela = (m: string) => /atendimentos_bloqueios|schema cache|does not exist/i.test(m);

/** Só os dígitos do telefone; é assim que o WhatsApp entrega o número. */
export const soDigitos = (t: string) => t.replace(/\D/g, "");

/** Coloca o telefone na lista de bloqueio da empresa. Retorna true quando gravou. */
export async function bloquearContato(p: { empresaId: unknown; telefone: string; nome?: string; motivo?: string; usuarioId?: unknown }): Promise<boolean> {
  const tel = soDigitos(p.telefone);
  if (!tel) { toast.error("Este contato não tem telefone para bloquear."); return false; }
  const r = await tb("atendimentos_bloqueios").upsert(
    { empresa_id: p.empresaId, telefone: tel, nome: p.nome ?? null, motivo: p.motivo || "Spam", bloqueado_por: p.usuarioId ?? null },
    { onConflict: "empresa_id,telefone" },
  );
  if (r.error) { toast.error(faltaTabela(r.error.message) ? SCRIPT : r.error.message); return false; }
  return true;
}

/** Compara telefones ignorando o 55 do Brasil. */
const chaveTel = (t: string) => { const d = soDigitos(t); return d.length > 11 && d.startsWith("55") ? d.slice(2) : d; };

/** Mapa telefone → bloqueio da empresa; vazio se a tabela ainda não existe. */
export function useBloqueados(empresaId: unknown) {
  const q = useQuery({
    queryKey: ["atendimentos-bloqueios", empresaId, "mapa"], enabled: !!empresaId, staleTime: 60_000,
    queryFn: async () => {
      const r = await tb("atendimentos_bloqueios").select("*").eq("empresa_id", empresaId).limit(5000);
      if (r.error) return [] as Bloq[];
      return r.data as Bloq[];
    },
  });
  return useMemo(() => {
    const m = new Map<string, Bloq>();
    for (const b of q.data ?? []) m.set(chaveTel(b.telefone), b);
    return (tel: unknown) => { const k = chaveTel(String(tel ?? "")); return k ? m.get(k) : undefined; };
  }, [q.data]);
}

/** Selo vermelho "Bloqueado" com o motivo no tooltip. */
export function SeloBloqueado({ motivo, compacto }: { motivo?: string | null; compacto?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-1.5 text-[10px] font-medium text-destructive">
          <Ban className="h-3 w-3" />{!compacto && "Bloqueado"}
        </span>
      </TooltipTrigger>
      <TooltipContent>Contato bloqueado{motivo ? `: ${motivo}` : ""}</TooltipContent>
    </Tooltip>
  );
}

type Bloq = { id: string; telefone: string; nome: string | null; motivo: string | null; created_at: string };

export function BloqueiosDialog({ open, onOpenChange, empresaId }: { open: boolean; onOpenChange: (v: boolean) => void; empresaId: unknown }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const q = useQuery({
    queryKey: ["atendimentos-bloqueios", empresaId], enabled: open && !!empresaId,
    queryFn: async () => {
      const r = await tb("atendimentos_bloqueios").select("*").eq("empresa_id", empresaId).order("created_at", { ascending: false }).limit(2000);
      if (r.error) throw new Error(faltaTabela(r.error.message) ? SCRIPT : r.error.message);
      return r.data as Bloq[];
    },
  });
  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase(), d = soDigitos(busca);
    return (q.data ?? []).filter((b) => !t || (b.nome ?? "").toLowerCase().includes(t) || (d && b.telefone.includes(d)) || (b.motivo ?? "").toLowerCase().includes(t));
  }, [q.data, busca]);

  const desbloquear = async (b: Bloq) => {
    if (!(await confirmar({ title: "Desbloquear contato", description: `${b.nome || b.telefone} volta a abrir atendimentos ao mandar mensagem.`, confirmText: "Desbloquear" }))) return;
    const r = await tb("atendimentos_bloqueios").delete().eq("id", b.id);
    if (r.error) return void toast.error(r.error.message);
    toast.success("Contato desbloqueado.");
    void qc.invalidateQueries({ queryKey: ["atendimentos-bloqueios"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Ban className="h-5 w-5" /> Contatos bloqueados</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Mensagens destes números são ignoradas: não abrem atendimento nem avisam a equipe.</p>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar por nome, telefone ou motivo" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar bloqueados" />
        </div>
        <div className="max-h-[50vh] divide-y overflow-y-auto rounded-md border">
          {q.isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando…</p>}
          {q.error && <p className="p-4 text-sm text-destructive">{(q.error as Error).message}</p>}
          {!q.isLoading && !q.error && !lista.length && <p className="p-4 text-sm text-muted-foreground">Nenhum contato bloqueado.</p>}
          {lista.map((b) => (
            <div key={b.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{b.nome || b.telefone}</p>
                <p className="truncate text-xs text-muted-foreground">{b.telefone} · {b.motivo || "Spam"} · {new Date(b.created_at).toLocaleDateString("pt-BR")}</p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" aria-label="Desbloquear" onClick={() => void desbloquear(b)}><Unlock className="h-4 w-4" /></Button>
                </TooltipTrigger>
                <TooltipContent>Desbloquear</TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
