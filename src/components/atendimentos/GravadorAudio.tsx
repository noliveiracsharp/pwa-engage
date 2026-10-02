import { useEffect, useRef, useState } from "react";
import { Mic, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const BARRAS = 24;

/** Grava voz pelo microfone e devolve um arquivo de áudio pronto para envio. */
export function GravadorAudio({ disabled, onGravado }: { disabled?: boolean; onGravado: (f: File) => void }) {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [niveis, setNiveis] = useState<number[]>(() => Array(BARRAS).fill(0));
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const enviarRef = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const picoRef = useRef(0);

  const limpar = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    recRef.current?.stream.getTracks().forEach((t) => t.stop());
    recRef.current = null;
    setGravando(false);
    setSegundos(0);
    setNiveis(Array(BARRAS).fill(0));
  };

  useEffect(() => () => { enviarRef.current = false; recRef.current?.state === "recording" && recRef.current.stop(); limpar(); }, []);

  function animar(stream: MediaStream) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    ctxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const dados = new Uint8Array(analyser.fftSize);
    let ultimo = 0;
    const loop = (t: number) => {
      analyser.getByteTimeDomainData(dados);
      let soma = 0;
      for (const v of dados) { const x = (v - 128) / 128; soma += x * x; }
      const nivel = Math.min(1, Math.sqrt(soma / dados.length) * 4);
      picoRef.current = Math.max(picoRef.current, nivel);
      if (t - ultimo > 70) {
        ultimo = t;
        setNiveis((n) => [...n.slice(1), nivel]);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }

  async function iniciar() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Seu navegador não permite gravar áudio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const mime = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      enviarRef.current = false;
      picoRef.current = 0;
      rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        const tipo = rec.mimeType || mime || "audio/webm";
        const ext = tipo.includes("ogg") ? "ogg" : tipo.includes("mp4") ? "m4a" : "webm";
        const blob = new Blob(chunks.current, { type: tipo.split(";")[0] ?? tipo });
        const enviar = enviarRef.current;
        const pico = picoRef.current;
        limpar();
        if (!enviar || !blob.size) return;
        if (pico < 0.03) {
          toast.error("Nenhuma voz foi captada. Verifique se o microfone certo está selecionado e com volume.");
          return;
        }
        onGravado(new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type }));
      };
      rec.start(250);
      recRef.current = rec;
      setGravando(true);
      animar(stream);
      timer.current = setInterval(() => setSegundos((s) => s + 1), 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
    }
  }

  function parar(enviar: boolean) {
    enviarRef.current = enviar;
    if (recRef.current?.state === "recording") recRef.current.stop();
    else limpar();
  }

  if (!gravando) {
    return (
      <Button variant="ghost" size="icon" onClick={iniciar} disabled={disabled} aria-label="Gravar áudio">
        <Mic className="h-5 w-5" />
      </Button>
    );
  }
  const mm = String(Math.floor(segundos / 60)).padStart(2, "0");
  const ss = String(segundos % 60).padStart(2, "0");
  return (
    <div className="flex items-center gap-1 rounded-md bg-destructive/10 px-1">
      <Button variant="ghost" size="icon" onClick={() => parar(false)} aria-label="Cancelar gravação">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
      <span className="flex items-center gap-1.5 px-1 font-mono text-sm text-destructive">
        <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" /> {mm}:{ss}
      </span>
      <div className="flex h-8 items-center gap-[2px] px-1" aria-label="Nível do microfone">
        {niveis.map((n, i) => (
          <span
            key={i}
            className="w-[3px] rounded-full bg-primary transition-[height] duration-75"
            style={{ height: `${Math.max(3, n * 28)}px`, opacity: 0.4 + n * 0.6 }}
          />
        ))}
      </div>
      <Button size="icon" onClick={() => parar(true)} aria-label="Enviar áudio">
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}
