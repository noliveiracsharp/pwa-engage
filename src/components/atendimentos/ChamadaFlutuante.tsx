import { useEffect, useState } from "react";
import { Maximize2, Minimize2, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Chamada = { sala: string; video: boolean; inicio: number };

export function novaSala() {
  const r = crypto.getRandomValues(new Uint8Array(9));
  return "atendeai-" + Array.from(r, (b) => b.toString(36).padStart(2, "0")).join("");
}

export function jitsiUrl(sala: string, nome: string, video: boolean) {
  const cfg = [
    "config.prejoinPageEnabled=false",
    `config.startWithVideoMuted=${!video}`,
    "config.disableDeepLinking=true",
    `userInfo.displayName=${encodeURIComponent(JSON.stringify(nome))}`,
  ].join("&");
  return `https://meet.jit.si/${sala}#${cfg}`;
}

export function linkConvite(sala: string, video: boolean) {
  return `${window.location.origin}/chamada/${sala}${video ? "" : "?audio=1"}`;
}

export function duracao(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function ChamadaFlutuante({ chamada, nome, titulo, onEncerrar }: { chamada: Chamada; nome: string; titulo: string; onEncerrar: () => void }) {
  const [min, setMin] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div
      className={cn(
        "fixed z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl transition-all",
        min ? "bottom-4 right-4 h-56 w-80" : "bottom-4 right-4 h-[70vh] w-[min(720px,calc(100vw-2rem))]",
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{titulo}</p>
        <span className="text-xs tabular-nums text-muted-foreground">{duracao(agora - chamada.inicio)}</span>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMin((v) => !v)} aria-label={min ? "Expandir" : "Minimizar"}>
          {min ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
        </Button>
        <Button size="sm" variant="destructive" className="h-7" onClick={onEncerrar}>
          <PhoneOff className="mr-1 h-4 w-4" /> Encerrar
        </Button>
      </div>
      <iframe
        title="Chamada"
        src={jitsiUrl(chamada.sala, nome, chamada.video)}
        allow="camera; microphone; display-capture; fullscreen; autoplay; clipboard-write"
        className="h-full w-full flex-1 border-0 bg-background"
      />
    </div>
  );
}
