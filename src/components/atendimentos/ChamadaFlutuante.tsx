import { useEffect, useRef, useState } from "react";
import { Link2, Maximize2, MessageSquare, Minimize2, PhoneOff, PictureInPicture2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SalaWebRTC } from "./SalaWebRTC";

export type Chamada = { sala: string; video: boolean; inicio: number; iniciador?: string };

export function novaSala() {
  const r = crypto.getRandomValues(new Uint8Array(9));
  return "atendeai-" + Array.from(r, (b) => b.toString(36).padStart(2, "0")).join("");
}

export function linkConvite(sala: string, video: boolean) {
  return `${window.location.origin}/chamada/${sala}${video ? "" : "?audio=1"}`;
}

export function duracao(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Janela da chamada. No modo "meet" ocupa a tela inteira e deixa espaço à direita
 * para o chat acoplado (controlado por chatAberto/onChat), como no Google Meet.
 */
export function ChamadaFlutuante({ chamada, nome, titulo, onEncerrar, onParticipante, onGravacao, meet, min: minExt, onMin, chatAberto, onChat }: {
  chamada: Chamada; nome: string; titulo: string; onEncerrar: () => void; onParticipante?: (nome: string) => void; onGravacao?: (audio: Blob) => void;
  meet?: boolean; min?: boolean; onMin?: (v: boolean) => void; chatAberto?: boolean; onChat?: () => void;
}) {
  const [minInt, setMinInt] = useState(false);
  const min = minExt ?? minInt;
  const setMin = (v: boolean) => { setMinInt(v); onMin?.(v); };
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const raiz = useRef<HTMLDivElement>(null);
  const abrirPip = async () => {
    const doc = document as any;
    try {
      if (doc.pictureInPictureElement) { await doc.exitPictureInPicture(); return; }
      if (!doc.pictureInPictureEnabled) { toast.error("Seu navegador não permite janela flutuante. Use Chrome ou Edge."); return; }
      const vids = Array.from(raiz.current?.querySelectorAll("video") ?? []) as HTMLVideoElement[];
      // Prefere o vídeo de quem está do outro lado (o local é mudo e fica por último).
      const alvo = vids.find((v) => !v.muted && v.srcObject) ?? vids.find((v) => v.srcObject);
      if (!alvo) { toast.error("Ainda não há vídeo na chamada."); return; }
      await alvo.requestPictureInPicture();
    } catch {
      toast.error("Não foi possível abrir a janela flutuante.");
    }
  };
  return (
    <div
      ref={raiz}
      className={cn(
        "fixed flex flex-col overflow-hidden border border-border bg-card shadow-2xl transition-all",
        min
          ? "bottom-4 right-4 z-50 h-56 w-80 rounded-xl"
          : meet
            ? cn("inset-y-0 left-0 z-[55] rounded-none border-0", chatAberto ? "right-0 md:right-[380px]" : "right-0")
            : "bottom-4 right-4 z-50 h-[70vh] w-[min(720px,calc(100vw-2rem))] rounded-xl",
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{titulo}</p>
        <span className="text-xs tabular-nums text-muted-foreground">{duracao(agora - chamada.inicio)}</span>
        {meet && onChat && !min && (
          <Button size="sm" variant={chatAberto ? "default" : "ghost"} className="h-7" onClick={onChat} aria-label={chatAberto ? "Ocultar chat" : "Mostrar chat"} title={chatAberto ? "Ocultar chat" : "Mostrar chat"}>
            <MessageSquare className="mr-1 h-4 w-4" /> Chat
          </Button>
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Copiar link para convidar mais pessoas" aria-label="Copiar link de convite" onClick={() => void navigator.clipboard.writeText(linkConvite(chamada.sala, chamada.video)).then(() => toast.success("Link copiado. Envie para quem deve entrar na sala."))}>
          <Link2 className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void abrirPip()} aria-label="Janela flutuante fora do sistema" title="Janela flutuante (acompanha você em outros programas)">
          <PictureInPicture2 className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMin(!min)} aria-label={min ? "Expandir" : "Minimizar"} title={min ? "Expandir" : "Minimizar para navegar no sistema"}>
          {min ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
        </Button>
        <Button size="sm" variant="destructive" className="h-7" onClick={onEncerrar}>
          <PhoneOff className="mr-1 h-4 w-4" /> Encerrar
        </Button>
      </div>
      <SalaWebRTC sala={chamada.sala} nome={nome} video={chamada.video} onSair={onEncerrar} onParticipante={onParticipante} gravavel onGravacao={onGravacao} className="flex-1" />
    </div>
  );
}
