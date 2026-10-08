import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, MonitorUp, PhoneOff, Video, VideoOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ICE: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

type Remoto = { id: string; nome: string; stream: MediaStream | null };
type Sinal = { de: string; para: string; nome: string; tipo: "offer" | "answer" | "ice"; data: any };

function VideoTile({ stream, nome, mudo, espelhar }: { stream: MediaStream | null; nome: string; mudo?: boolean; espelhar?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  const temVideo = !!stream?.getVideoTracks().some((t) => t.enabled && t.readyState === "live");
  return (
    <div className="relative flex min-h-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
      <video ref={ref} autoPlay playsInline muted={mudo} className={cn("h-full w-full object-cover", espelhar && "-scale-x-100", !temVideo && "opacity-0")} />
      {!temVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground">
            {(nome || "?").charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      <span className="absolute bottom-2 left-2 rounded bg-background/80 px-2 py-0.5 text-xs text-foreground">{nome}</span>
    </div>
  );
}

/** Sala de chamada nativa (WebRTC em malha, sinalização por canal em tempo real). */
export function SalaWebRTC({ sala, nome, video, onSair, onParticipante, className }: { sala: string; nome: string; video: boolean; onSair: () => void; onParticipante?: ((nome: string) => void) | undefined; className?: string }) {
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remotos, setRemotos] = useState<Remoto[]>([]);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(video);
  const [tela, setTela] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const localRef = useRef<MediaStream | null>(null);
  const camTrack = useRef<MediaStreamTrack | null>(null);
  const partRef = useRef(onParticipante);
  partRef.current = onParticipante;

  useEffect(() => {
    let ativo = true;
    const meuId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const canal = supabase.channel(`chamada:${sala}`, { config: { broadcast: { self: false }, presence: { key: meuId } } });

    const enviar = (s: Omit<Sinal, "de" | "nome">) =>
      canal.send({ type: "broadcast", event: "sinal", payload: { ...s, de: meuId, nome } });

    const setRemoto = (id: string, patch: Partial<Remoto>) =>
      setRemotos((rs) => (rs.some((r) => r.id === id) ? rs.map((r) => (r.id === id ? { ...r, ...patch } : r)) : [...rs, { id, nome: "", stream: null, ...patch }]));

    const criarPeer = (id: string, nomeRemoto: string) => {
      let pc = peers.current.get(id);
      if (pc) return pc;
      pc = new RTCPeerConnection(ICE);
      peers.current.set(id, pc);
      localRef.current?.getTracks().forEach((t) => pc!.addTrack(t, localRef.current!));
      if (!localRef.current?.getVideoTracks().length) pc.addTransceiver("video", { direction: "sendrecv" });
      pc.onicecandidate = (e) => e.candidate && enviar({ para: id, tipo: "ice", data: e.candidate.toJSON() });
      pc.ontrack = (e) => setRemoto(id, { stream: e.streams[0] ?? new MediaStream([e.track]) });
      pc.onconnectionstatechange = () => {
        if (pc && ["failed", "closed"].includes(pc.connectionState)) remover(id);
      };
      setRemoto(id, { nome: nomeRemoto });
      return pc;
    };

    const remover = (id: string) => {
      peers.current.get(id)?.close();
      peers.current.delete(id);
      setRemotos((rs) => rs.filter((r) => r.id !== id));
    };

    canal.on("broadcast", { event: "sinal" }, async ({ payload }) => {
      const s = payload as Sinal;
      if (s.para !== meuId) return;
      try {
        if (s.tipo === "offer") {
          const pc = criarPeer(s.de, s.nome);
          await pc.setRemoteDescription(s.data);
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          enviar({ para: s.de, tipo: "answer", data: pc.localDescription });
        } else if (s.tipo === "answer") {
          await peers.current.get(s.de)?.setRemoteDescription(s.data);
        } else if (s.tipo === "ice") {
          await peers.current.get(s.de)?.addIceCandidate(s.data);
        }
      } catch (e) {
        console.error("chamada sinal", e);
      }
    });

    canal.on("presence", { event: "sync" }, async () => {
      const estado = canal.presenceState<{ nome: string }>();
      const ids = Object.keys(estado).filter((k) => k !== meuId);
      for (const id of [...peers.current.keys()]) if (!ids.includes(id)) remover(id);
      for (const id of ids) {
        if (peers.current.has(id) || meuId > id) continue; // menor id inicia
        const pc = criarPeer(id, estado[id]?.[0]?.nome ?? "Participante");
        const off = await pc.createOffer();
        await pc.setLocalDescription(off);
        enviar({ para: id, tipo: "offer", data: pc.localDescription });
      }
      setRemotos((rs) => rs.map((r) => ({ ...r, nome: estado[r.id]?.[0]?.nome ?? r.nome })));
      for (const id of ids) { const n = estado[id]?.[0]?.nome; if (n) partRef.current?.(n); }
    });

    (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          setCam(false);
        } catch {
          setErro("Não foi possível acessar o microfone. Verifique as permissões do navegador.");
          stream = new MediaStream();
        }
      }
      if (!ativo) return stream.getTracks().forEach((t) => t.stop());
      localRef.current = stream;
      camTrack.current = stream.getVideoTracks()[0] ?? null;
      setLocal(stream);
      canal.subscribe((st) => {
        if (st === "SUBSCRIBED") canal.track({ nome });
      });
    })();

    return () => {
      ativo = false;
      peers.current.forEach((pc) => pc.close());
      peers.current.clear();
      localRef.current?.getTracks().forEach((t) => t.stop());
      supabase.removeChannel(canal);
    };
  }, [sala, nome, video]);

  const alternarMic = () => {
    const v = !mic;
    localRef.current?.getAudioTracks().forEach((t) => (t.enabled = v));
    setMic(v);
  };

  const trocarVideo = (track: MediaStreamTrack | null) => {
    peers.current.forEach((pc) => {
      const sender = pc.getTransceivers().find((t) => t.receiver.track?.kind === "video")?.sender;
      sender?.replaceTrack(track);
    });
  };

  const alternarCam = async () => {
    if (cam) {
      camTrack.current?.stop();
      if (camTrack.current) localRef.current?.removeTrack(camTrack.current);
      camTrack.current = null;
      if (!tela) trocarVideo(null);
      setCam(false);
    } else {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true });
        const t = s.getVideoTracks()[0]!;
        camTrack.current = t;
        localRef.current?.addTrack(t);
        if (!tela) trocarVideo(t);
        setCam(true);
      } catch {
        setErro("Não foi possível acessar a câmera.");
      }
    }
    setLocal(localRef.current ? new MediaStream(localRef.current.getTracks()) : null);
  };

  const alternarTela = async () => {
    if (tela) {
      trocarVideo(camTrack.current);
      setTela(false);
      setLocal(localRef.current ? new MediaStream(localRef.current.getTracks()) : null);
      return;
    }
    try {
      const s = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
      const t: MediaStreamTrack = s.getVideoTracks()[0]!;
      trocarVideo(t);
      setTela(true);
      const audios = localRef.current?.getAudioTracks() ?? [];
      setLocal(new MediaStream([...audios, t]));
      t.onended = () => {
        trocarVideo(camTrack.current);
        setTela(false);
        setLocal(localRef.current ? new MediaStream(localRef.current.getTracks()) : null);
      };
    } catch {
      /* cancelado */
    }
  };

  const total = remotos.length + 1;
  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
      {erro && <p className="bg-destructive/10 px-3 py-2 text-xs text-destructive">{erro}</p>}
      <div className={cn("grid min-h-0 flex-1 gap-2 p-2", total === 1 ? "grid-cols-1" : total <= 4 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
        {remotos.map((r) => (
          <VideoTile key={r.id} stream={r.stream} nome={r.nome || "Participante"} />
        ))}
        <VideoTile stream={local} nome={`${nome} (você)`} mudo espelhar={!tela} />
      </div>
      {remotos.length === 0 && <p className="pb-1 text-center text-xs text-muted-foreground">Aguardando outros participantes entrarem…</p>}
      <div className="flex items-center justify-center gap-2 border-t border-border p-2">
        <Button size="icon" variant={mic ? "secondary" : "destructive"} onClick={alternarMic} aria-label="Microfone">
          {mic ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </Button>
        <Button size="icon" variant={cam ? "secondary" : "outline"} onClick={alternarCam} aria-label="Câmera">
          {cam ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
        </Button>
        {typeof navigator !== "undefined" && !!(navigator.mediaDevices as any)?.getDisplayMedia && (
          <Button size="icon" variant={tela ? "default" : "secondary"} onClick={alternarTela} aria-label="Compartilhar tela">
            <MonitorUp className="h-4 w-4" />
          </Button>
        )}
        <Button variant="destructive" onClick={onSair}>
          <PhoneOff className="mr-1 h-4 w-4" /> Sair
        </Button>
      </div>
    </div>
  );
}
