import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Settings, Sparkles, Send, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { type Atualizacao, type Versao, TIPO_CLASS, TIPO_LABEL, fmtData } from "@/lib/versoes";

const db = supabase as any;

export function useVersaoAtual() {
  return useQuery({
    queryKey: ["sistema_versoes", "atual"],
    queryFn: async () => {
      const { data } = await db.from("sistema_versoes").select("*").eq("is_atual", true)
        .order("major", { ascending: false }).order("minor", { ascending: false }).order("patch", { ascending: false }).limit(1);
      return ((data ?? [])[0] ?? null) as Versao | null;
    },
    staleTime: 5 * 60_000,
  });
}

function Card({ a }: { a: Atualizacao }) {
  const [open, setOpen] = useState(false);
  return (
    <button type="button" onClick={() => setOpen((o) => !o)}
      className="w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("rounded px-2 py-0.5 text-[10px] font-semibold uppercase", TIPO_CLASS[a.tipo])}>{TIPO_LABEL[a.tipo]}</span>
        <span className="text-xs text-muted-foreground">{fmtData(a.data_publicacao)}</span>
      </div>
      <div className="mt-2 flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">{a.titulo}</p>
        <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </div>
      {open && <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">{a.descricao}</p>}
    </button>
  );
}

export function NovidadesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { usuario, empresa, isMaster } = useAuth();
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const { data: itens = [] } = useQuery({
    queryKey: ["sistema_atualizacoes", "publicas"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db.from("sistema_atualizacoes").select("*").eq("ativo", true)
        .order("data_publicacao", { ascending: false }).order("ordem");
      if (error) throw error;
      return (data ?? []) as Atualizacao[];
    },
  });

  const ultimas = itens.filter((i) => i.categoria === "ultimas");
  const futuras = itens.filter((i) => i.categoria === "futuras");

  const enviar = async () => {
    if (!texto.trim()) return;
    setEnviando(true);
    const { error } = await db.from("sistema_sugestoes").insert({
      sugestao: texto.trim(),
      usuario_id: (usuario as any)?.id ?? null,
      empresa_id: (empresa as any)?.id ?? (usuario as any)?.empresa_id ?? null,
    });
    setEnviando(false);
    if (error) { toast.error(error.message); return; }
    setTexto("");
    toast.success("Sugestão enviada! Obrigado.");
    qc.invalidateQueries({ queryKey: ["sistema_sugestoes"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden">
        <DialogHeader className="flex-row items-center justify-between space-y-0 pr-8">
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Novidades</DialogTitle>
          {isMaster && (
            <Button asChild size="sm" variant="outline" onClick={() => onOpenChange(false)}>
              <Link to="/admin/versoes"><Settings className="mr-1 h-4 w-4" /> Gerenciar versões</Link>
            </Button>
          )}
        </DialogHeader>
        <div className="grid gap-4 overflow-y-auto md:grid-cols-3" style={{ maxHeight: "calc(90vh - 7rem)" }}>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Últimas atualizações</h3>
            {ultimas.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma atualização publicada.</p>}
            {ultimas.map((a) => <Card key={a.id} a={a} />)}
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Futuras atualizações</h3>
            {futuras.length === 0 && <p className="text-xs text-muted-foreground">Em breve novidades por aqui.</p>}
            {futuras.map((a) => <Card key={a.id} a={a} />)}
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Envie sua sugestão para nós</h3>
            <p className="text-xs text-muted-foreground">Conte qual funcionalidade ajudaria no seu dia a dia.</p>
            <Textarea rows={8} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Digite sua sugestão..." />
            <Button className="w-full" onClick={enviar} disabled={enviando || !texto.trim()}>
              <Send className="mr-1 h-4 w-4" /> {enviando ? "Enviando..." : "Enviar"}
            </Button>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function VersaoSidebar({ open }: { open: boolean }) {
  const { data: versao } = useVersaoAtual();
  const [dlg, setDlg] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setDlg(true)} title="Novidades"
        className={cn("mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          !open && "justify-center px-0")}>
        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
        {open ? <span>Versão {versao?.versao ?? "—"}</span> : <span className="sr-only">Novidades</span>}
      </button>
      <NovidadesDialog open={dlg} onOpenChange={setDlg} />
    </>
  );
}
