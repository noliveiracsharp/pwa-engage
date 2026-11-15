import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, MessageSquare, Pin, Send, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { confirmar, perguntar } from "@/components/layout/DialogoGlobal";
import { cn } from "@/lib/utils";
import { AcaoIcone } from "./AcaoIcone";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Msg = { id: string; autor: string; unidade: string | null; texto: string; oficial: boolean; fixada: boolean; status: "pendente" | "publicada" | "rejeitada"; motivo: string | null; minha: boolean; em: string };
type Debate = { gestor: boolean; ativo: boolean; moderado: boolean; encerrado: boolean; mensagens: Msg[] };

const erroMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Não foi possível concluir.");
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Fórum de debate de uma pauta. Mesmo componente para gestão (modera) e condômino (participa). */
export function DebatePauta({ pautaId, assembleiaId }: { pautaId: string; assembleiaId: string }) {
  const qc = useQueryClient();
  const chave = ["cond", "assembleia-debate", pautaId];
  const { data, isLoading, error } = useQuery({
    queryKey: chave, refetchInterval: 20_000,
    queryFn: async (): Promise<Debate> => {
      const { data, error } = await db.rpc("cond_assembleia_debate_listar", { p_pauta: pautaId });
      if (error) throw error;
      return data as Debate;
    },
  });
  const recarregar = () => qc.invalidateQueries({ queryKey: chave });
  useEffect(() => {
    const ch = supabase.channel(`debate-${pautaId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cond_assembleia_mensagens", filter: `pauta_id=eq.${pautaId}` }, () => qc.invalidateQueries({ queryKey: ["cond", "assembleia-debate", pautaId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [pautaId, assembleiaId, qc]);

  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const enviar = async () => {
    if (!texto.trim()) return;
    setEnviando(true);
    const { data: st, error } = await db.rpc("cond_assembleia_debate_enviar", { p_pauta: pautaId, p_texto: texto });
    setEnviando(false);
    if (error) { toast.error(erroMsg(error)); return; }
    setTexto("");
    toast.success(st === "pendente" ? "Mensagem enviada para a mesa aprovar." : "Mensagem publicada.");
    recarregar();
  };
  const moderar = async (m: Msg, acao: "aprovar" | "rejeitar" | "fixar" | "excluir") => {
    let motivo: string | null = null;
    if (acao === "rejeitar") {
      const r = await perguntar({ title: "Rejeitar mensagem?", description: "O autor verá o motivo. Os demais não verão a mensagem.", placeholder: "Motivo (opcional)", confirmText: "Rejeitar" });
      if (r === null) return;
      motivo = r;
    }
    if (acao === "excluir" && !(await confirmar({ title: "Excluir mensagem?", description: "Ela some do debate para todos.", confirmText: "Excluir", destructive: true }))) return;
    const { error } = await db.rpc("cond_assembleia_debate_moderar", { p_mensagem: m.id, p_acao: acao, p_motivo: motivo });
    if (error) toast.error(erroMsg(error)); else recarregar();
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando debate…</p>;
  if (error) return <p className="text-sm text-destructive">{erroMsg(error)}</p>;
  if (!data) return null;
  if (!data.ativo) return <p className="text-sm text-muted-foreground">Esta pauta não tem debate.</p>;
  const pendentes = data.mensagens.filter((m) => m.status === "pendente").length;

  return (
    <section aria-label="Debate da pauta" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">{data.moderado ? <><ShieldCheck className="mr-1 size-3" aria-hidden />Com mediação</> : "Sem mediação"}</Badge>
        {data.encerrado && <Badge variant="outline" className="bg-muted">Debate fechado</Badge>}
        {data.gestor && pendentes > 0 && <Badge className="bg-warning/20 text-foreground" variant="outline">{pendentes} aguardando aprovação</Badge>}
      </div>
      {data.mensagens.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground"><MessageSquare className="mx-auto mb-1 size-5 opacity-60" aria-hidden />Nenhuma mensagem ainda.</p>
      ) : (
        <ul className="max-h-[50dvh] space-y-2 overflow-y-auto pr-1" aria-live="polite">
          {data.mensagens.map((m) => (
            <li key={m.id} className={cn("rounded-md border p-3 text-sm", m.oficial && "border-primary/40 bg-primary/5", m.status === "pendente" && "border-dashed", m.status === "rejeitada" && "opacity-70")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{m.autor}</span>
                {m.unidade && <span className="text-xs text-muted-foreground">Unid. {m.unidade}</span>}
                {m.oficial && <Badge variant="outline" className="text-primary">Mesa</Badge>}
                {m.fixada && <Pin className="size-3 text-primary" aria-label="Fixada" />}
                {m.status === "pendente" && <Badge variant="outline"><Clock className="mr-1 size-3" aria-hidden />Aguardando aprovação</Badge>}
                {m.status === "rejeitada" && <Badge variant="outline" className="text-destructive">Rejeitada</Badge>}
                <span className="ml-auto text-xs text-muted-foreground">{hora(m.em)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words">{m.texto}</p>
              {m.status === "rejeitada" && m.motivo && <p className="mt-1 text-xs text-destructive">Motivo: {m.motivo}</p>}
              {data.gestor && (
                <div className="mt-2 flex flex-wrap justify-end gap-1">
                  {m.status !== "publicada" && <AcaoIcone titulo="Aprovar" onClick={() => moderar(m, "aprovar")}><Check className="size-4" /></AcaoIcone>}
                  {m.status !== "rejeitada" && !m.oficial && <AcaoIcone titulo="Rejeitar" onClick={() => moderar(m, "rejeitar")}><X className="size-4" /></AcaoIcone>}
                  {m.status === "publicada" && <AcaoIcone titulo={m.fixada ? "Desafixar" : "Fixar no topo"} onClick={() => moderar(m, "fixar")}><Pin className="size-4" /></AcaoIcone>}
                  <AcaoIcone titulo="Excluir" destrutivo onClick={() => moderar(m, "excluir")}><Trash2 className="size-4" /></AcaoIcone>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!data.encerrado && (
        <div className="space-y-2">
          <label htmlFor={`deb-${pautaId}`} className="sr-only">Sua mensagem</label>
          <Textarea id={`deb-${pautaId}`} value={texto} maxLength={4000} rows={3} onChange={(e) => setTexto(e.target.value)}
            placeholder={data.gestor ? "Mensagem oficial da mesa…" : data.moderado ? "Sua pergunta ou opinião (a mesa aprova antes de publicar)…" : "Sua pergunta ou opinião…"}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(); } }} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{texto.length}/4000 · Ctrl+Enter envia</span>
            <Button size="sm" onClick={enviar} disabled={enviando || !texto.trim()}><Send className="size-4" /> {enviando ? "Enviando…" : "Enviar"}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
