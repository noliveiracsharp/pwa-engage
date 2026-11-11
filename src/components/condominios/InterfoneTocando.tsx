import { useEffect, useRef, useState } from "react";
import { BellRing, DoorOpen, Phone, PhoneOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SalaWebRTC } from "@/components/atendimentos/SalaWebRTC";
import { confirmar } from "@/components/layout/DialogoGlobal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Toque = { id: string; destino: string; visitante_nome: string; motivo: string | null; foto: string | null; unidade: string | null; bloco: string | null; central: boolean };

const rotulo = (t: Toque) => t.destino === "portaria" ? "Portaria" : t.destino === "administracao" ? "Administração" : `${t.bloco ? t.bloco + " · " : ""}Unidade ${t.unidade ?? ""}`;

/** Escuta chamadas do interfone virtual para o usuário logado (morador, prestador ou central). */
export function InterfoneTocando({ nome }: { nome: string }) {
  const [toques, setToques] = useState<Toque[]>([]);
  const [ativa, setAtiva] = useState<{ id: string; sala: string; toque: Toque } | null>(null);
  const [aberta, setAberta] = useState(false);
  const audio = useRef<{ ctx: AudioContext; parar: () => void } | null>(null);

  useEffect(() => {
    if (ativa) return;
    let vivo = true;
    const ler = async () => {
      const { data, error } = await db.rpc("cond_interfone_tocando");
      if (vivo && !error) setToques((data ?? []) as Toque[]);
    };
    void ler();
    const t = setInterval(ler, 3000);
    return () => { vivo = false; clearInterval(t); };
  }, [ativa]);

  // Toque sonoro simples enquanto houver chamada.
  useEffect(() => {
    if (!toques.length || ativa) { audio.current?.parar(); audio.current = null; return; }
    if (audio.current) return;
    try {
      const ctx = new AudioContext();
      const iv = setInterval(() => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.4);
      }, 1200);
      audio.current = { ctx, parar: () => { clearInterval(iv); void ctx.close(); } };
    } catch { /* navegador sem áudio */ }
  }, [toques.length, ativa]);
  useEffect(() => () => audio.current?.parar(), []);

  const responder = async (t: Toque, acao: "atender" | "recusar") => {
    const { data, error } = await db.rpc("cond_interfone_responder", { p_id: t.id, p_acao: acao });
    if (error) { toast.error(error.message); setToques((x) => x.filter((y) => y.id !== t.id)); return; }
    if (acao === "atender") { setAberta(false); setAtiva({ id: t.id, sala: String(data.sala), toque: t }); }
    else setToques((x) => x.filter((y) => y.id !== t.id));
  };
  const encerrar = async () => {
    if (ativa) await db.rpc("cond_interfone_responder", { p_id: ativa.id, p_acao: "encerrar" });
    setAtiva(null);
  };
  const abrirPorta = async () => {
    if (!ativa) return;
    if (!(await confirmar({ title: "Liberar a entrada?", description: `Libera a entrada de ${ativa.toque.visitante_nome}. Fica registrado no histórico.`, confirmText: "Liberar" }))) return;
    const { data, error } = await db.rpc("cond_interfone_responder", { p_id: ativa.id, p_acao: "abrir_porta" });
    if (error) return toast.error(error.message);
    setAberta(true);
    toast.success(data?.acionado ? "Entrada liberada." : "Liberação registrada. A abertura automática da porta será ligada em breve.");
  };

  const t = toques[0];
  return (
    <>
      <Dialog open={!!t && !ativa} onOpenChange={(o) => { if (!o && t) void responder(t, "recusar"); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><BellRing className="size-5 animate-pulse text-primary" /> Interfone · {t ? rotulo(t) : ""}</DialogTitle>
            <DialogDescription>{t?.central ? "Ninguém da unidade atendeu — chamada na central." : "Tem alguém chamando no portão."}</DialogDescription>
          </DialogHeader>
          {t && (
            <div className="space-y-4">
              {t.foto ? <img src={t.foto} alt={`Foto de ${t.visitante_nome}`} className="mx-auto aspect-video w-full rounded-lg object-cover" /> : <div className="flex aspect-video items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">Sem foto</div>}
              <div className="text-center"><p className="font-semibold">{t.visitante_nome}</p>{t.motivo && <p className="text-sm text-muted-foreground">{t.motivo}</p>}</div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="destructive" onClick={() => void responder(t, "recusar")}><PhoneOff className="size-4" /> Recusar</Button>
                <Button onClick={() => void responder(t, "atender")}><Phone className="size-4" /> Atender</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {ativa && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-background" role="dialog" aria-label="Chamada do interfone">
          <div className="flex items-center justify-between gap-2 border-b p-3">
            <div className="min-w-0"><p className="truncate font-semibold">{ativa.toque.visitante_nome}</p><p className="truncate text-xs text-muted-foreground">{rotulo(ativa.toque)}{ativa.toque.motivo ? ` · ${ativa.toque.motivo}` : ""}</p></div>
            <Button variant={aberta ? "secondary" : "default"} disabled={aberta} onClick={() => void abrirPorta()}><DoorOpen className="size-4" /> {aberta ? "Entrada liberada" : "Abrir porta"}</Button>
          </div>
          {/* Morador começa com câmera desligada: o visitante só ouve, por privacidade. */}
          <SalaWebRTC sala={ativa.sala} nome={nome} video={false} onSair={() => void encerrar()} className="flex-1" />
        </div>
      )}
    </>
  );
}
