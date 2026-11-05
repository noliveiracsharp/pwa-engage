import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Glasses, Loader2, RotateCcw, ScanFace, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { avaliarAoVivo, avaliarLuz, detectorVideo, quadroRosto, type Caixa } from "@/lib/foto-rosto";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

type Props = { open: boolean; rosto: boolean; onClose: () => void; onFoto: (f: File) => void };

const ORIENTACOES = [
  "Retire óculos (de grau ou escuros)",
  "Retire boné, chapéu ou capuz",
  "Retire máscara e fones de ouvido",
  "Afaste o cabelo do rosto",
  "Fique em local bem iluminado, sem contraluz",
  "Expressão neutra, olhando para a câmera",
];

/** Captura pela câmera. Com `rosto`, moldura oval guiada por IA (padrão biometria bancária). */
export function CameraCaptura({ open, rosto, onClose, onFoto }: Props) {
  const [etapa, setEtapa] = useState<"orientacao" | "camera" | "revisao">(rosto ? "orientacao" : "camera");
  const [frontal, setFrontal] = useState(rosto);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("Iniciando câmera…");
  const [ok, setOk] = useState(false);
  const [iaOk, setIaOk] = useState(true);
  const [previa, setPrevia] = useState<{ url: string; file: File } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const okDesde = useRef(0);
  const ultimaCaixa = useRef<Caixa | null>(null);
  const [confirmado, setConfirmado] = useState(false);

  const parar = useCallback(() => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; }, []);

  useEffect(() => {
    if (!open) { parar(); setEtapa(rosto ? "orientacao" : "camera"); setPrevia(null); setErro(""); }
  }, [open, rosto, parar]);

  // Liga a câmera
  useEffect(() => {
    if (!open || etapa !== "camera") return;
    let vivo = true;
    (async () => {
      setErro(""); setAviso("Iniciando câmera…");
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador não permite usar a câmera.");
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: frontal ? "user" : "environment", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        if (!vivo) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
        setAviso(rosto ? "Posicione o rosto dentro da moldura" : "Enquadre e toque em Tirar foto");
      } catch (e) {
        const n = e instanceof DOMException ? e.name : "";
        setErro(n === "NotAllowedError" ? "Permissão da câmera negada. Libere o acesso nas configurações do navegador." : n === "NotFoundError" ? "Nenhuma câmera encontrada neste dispositivo." : e instanceof Error ? e.message : "Não foi possível abrir a câmera.");
      }
    })();
    return () => { vivo = false; parar(); };
  }, [open, etapa, frontal, rosto, parar]);

  // Análise ao vivo (IA)
  useEffect(() => {
    if (!open || etapa !== "camera" || !rosto) return;
    let vivo = true; let raf = 0; let ultimo = 0;
    const amostra = document.createElement("canvas"); amostra.width = 32; amostra.height = 24;
    const ctx = amostra.getContext("2d", { willReadFrequently: true });
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let det: any;
      try { det = await detectorVideo(); } catch { if (vivo) { setIaOk(false); setOk(true); setAviso("IA indisponível. Centralize o rosto e tire a foto."); } return; }
      const loop = (t: number) => {
        if (!vivo) return;
        raf = requestAnimationFrame(loop);
        const v = video.current;
        if (!v || v.readyState < 2 || t - ultimo < 120) return;
        ultimo = t;
        try {
          const r = det.detectForVideo(v, performance.now());
          // Conta qualquer rosto visível (mesmo ao fundo e com pouca confiança) para barrar outras pessoas.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const todos = (r.detections as any[]).filter((x) => (x.boundingBox?.width ?? 0) > v.videoWidth * 0.05)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .sort((a: any, b: any) => b.boundingBox.width - a.boundingBox.width);
          r.detections = todos;
          const d = todos[0];
          const b = d?.boundingBox;
          const kp = d?.keypoints;
          const res = avaliarAoVivo(r.detections.length, b ? { x: b.originX, y: b.originY, w: b.width, h: b.height } : null, v.videoWidth, v.videoHeight,
            kp && kp.length >= 2 ? { esq: kp[0], dir: kp[1] } : null);
          ultimaCaixa.current = b ? { x: b.originX, y: b.originY, w: b.width, h: b.height } : null;
          let final = res;
          if (res.ok && ctx) {
            ctx.drawImage(v, 0, 0, 32, 24);
            const px = ctx.getImageData(0, 0, 32, 24).data; let soma = 0;
            for (let i = 0; i < px.length; i += 4) soma += 0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!;
            const luz = avaliarLuz(soma / (px.length / 4));
            if (!luz.ok) final = { ok: false, aviso: luz.aviso! };
          }
          if (final.ok) { if (!okDesde.current) okDesde.current = t; } else okDesde.current = 0;
          const estavel = final.ok && t - okDesde.current > 700;
          setOk(estavel);
          setAviso(final.ok && !estavel ? "Mantenha a posição…" : final.aviso);
        } catch { /* frame ignorado */ }
      };
      raf = requestAnimationFrame(loop);
    })();
    return () => { vivo = false; cancelAnimationFrame(raf); okDesde.current = 0; };
  }, [open, etapa, rosto]);

  async function capturar() {
    const v = video.current; if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    const cx = ultimaCaixa.current;
    if (rosto && cx && iaOk) {
      // Recorta já no clique: só o rosto (3x4 quadrado), sem fundo nem outras pessoas.
      const q = quadroRosto(cx, v.videoWidth, v.videoHeight, 0.45);
      c.width = 600; c.height = 600;
      c.getContext("2d")!.drawImage(v, q.x, q.y, q.w, q.h, 0, 0, 600, 600);
    } else {
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext("2d")!.drawImage(v, 0, 0);
    }
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.92));
    const file = new File([blob], "camera.jpg", { type: "image/jpeg" });
    parar();
    setConfirmado(false);
    setPrevia({ url: URL.createObjectURL(blob), file });
    setEtapa("revisao");
  }

  const espelho = frontal ? "-scale-x-100" : "";
  const podeTirar = !rosto || ok || !iaOk;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{rosto ? <ScanFace className="size-5" /> : <Camera className="size-5" />} {rosto ? "Captura facial para controle de acesso" : "Tirar foto"}</DialogTitle>
          <DialogDescription>{rosto ? "Siga as orientações para uma foto aceita pelos leitores faciais da portaria." : "Use a câmera do dispositivo."}</DialogDescription>
        </DialogHeader>

        {etapa === "orientacao" && (
          <div className="space-y-4">
            <div className="flex justify-center"><span className="flex size-20 items-center justify-center rounded-full bg-primary/10 text-primary"><Glasses className="size-10" /></span></div>
            <ul className="space-y-2">
              {ORIENTACOES.map((o) => <li key={o} className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 shrink-0 text-primary" /> {o}</li>)}
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={() => setEtapa("camera")}><Camera className="size-4" /> Estou pronto</Button>
            </div>
          </div>
        )}

        {etapa === "camera" && (
          <div className="space-y-3">
            <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
              <video ref={video} playsInline muted className={cn("size-full object-cover", espelho)} />
              {rosto && !erro && (
                <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden>
                  <defs><mask id="oval-cam"><rect width="400" height="300" fill="white" /><ellipse cx="200" cy="135" rx="78" ry="104" fill="black" /></mask></defs>
                  <rect width="400" height="300" className="fill-background/70" mask="url(#oval-cam)" />
                  <ellipse cx="200" cy="135" rx="78" ry="104" fill="none" strokeWidth="4" strokeDasharray={ok ? undefined : "10 6"}
                    className={cn("transition-colors", ok ? "stroke-primary" : "stroke-destructive")} />
                </svg>
              )}
              {erro && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-destructive">{erro}</div>}
            </div>
            <p role="status" aria-live="polite" className={cn("rounded-md px-3 py-2 text-center text-sm font-medium", ok || !rosto ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>
              {erro ? "Câmera indisponível" : aviso}
            </p>
            {rosto && <p className="text-center text-xs text-muted-foreground">Sem óculos, boné ou máscara · cabeça reta · olhando para a câmera</p>}
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="outline" onClick={() => setFrontal((f) => !f)} disabled={!!erro}><SwitchCamera className="size-4" /> Alternar câmera</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Cancelar</Button>
                <Button onClick={capturar} disabled={!!erro || !podeTirar}>{podeTirar ? <Camera className="size-4" /> : <Loader2 className="size-4 animate-spin" />} Tirar foto</Button>
              </div>
            </div>
          </div>
        )}

        {etapa === "revisao" && previa && (
          <div className="space-y-3">
            <img src={previa.url} alt="Prévia da foto" className={cn("mx-auto max-h-80 rounded-lg", espelho)} />
            {rosto && (
              <label className="mx-auto flex max-w-md items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <Checkbox checked={confirmado} onCheckedChange={(c) => setConfirmado(c === true)} className="mt-0.5" />
                <span>Confirmo que estou <strong>sem óculos</strong>, boné ou máscara, com o rosto nítido e <strong>sozinho na foto</strong>. <span className="block text-xs text-muted-foreground">Fotos com óculos são recusadas pelos leitores faciais da portaria.</span></span>
              </label>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { URL.revokeObjectURL(previa.url); setPrevia(null); setEtapa("camera"); }}><RotateCcw className="size-4" /> Tirar outra</Button>
              <Button disabled={rosto && !confirmado} onClick={() => { onFoto(previa.file); URL.revokeObjectURL(previa.url); onClose(); }}><CheckCircle2 className="size-4" /> Usar esta foto</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
