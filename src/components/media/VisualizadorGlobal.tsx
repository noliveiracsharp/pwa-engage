import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { ChevronLeft, ChevronRight, Download, Maximize, RotateCw, X, ZoomIn, ZoomOut } from "lucide-react";

/**
 * Visualizador global: qualquer <img> do sistema (maior que um ícone) abre
 * em tela cheia com zoom, arraste, rotação e navegação entre as imagens do
 * mesmo bloco. Use data-no-zoom para desligar em um elemento específico.
 */
const MIN_PX = 56;

function elegivel(img: HTMLImageElement) {
  if (img.closest("[data-no-zoom],[data-visualizador],[data-sidebar],header,nav,button:not([data-zoom])")) return false;
  const r = img.getBoundingClientRect();
  return r.width >= MIN_PX && r.height >= MIN_PX && !!img.currentSrc;
}

export function VisualizadorGlobal() {
  const [imgs, setImgs] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [rot, setRot] = useState(0);
  const aberto = imgs.length > 0;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (!(alvo instanceof HTMLImageElement) || !elegivel(alvo)) return;
      e.preventDefault();
      e.stopPropagation();
      const grupo = alvo.closest("[data-galeria]") ?? alvo.closest("[role=dialog]") ?? alvo.closest("main") ?? document.body;
      const lista = Array.from(grupo.querySelectorAll("img")).filter(elegivel);
      const srcs = Array.from(new Set(lista.map((i) => i.currentSrc)));
      setImgs(srcs.length ? srcs : [alvo.currentSrc]);
      setIdx(Math.max(0, srcs.indexOf(alvo.currentSrc)));
      setRot(0);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const fechar = useCallback(() => setImgs([]), []);
  const ir = useCallback(
    (d: number) => {
      setIdx((i) => (i + d + imgs.length) % imgs.length);
      setRot(0);
    },
    [imgs.length],
  );

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); fechar(); }
      if (e.key === "ArrowRight") ir(1);
      if (e.key === "ArrowLeft") ir(-1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [aberto, fechar, ir]);

  if (!aberto || typeof document === "undefined") return null;
  const src = imgs[idx];
  const btn = "inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/20 text-background hover:bg-background/35";

  return createPortal(
    <div
      data-visualizador
      className="fixed inset-0 z-[9999] flex flex-col bg-foreground/90 pointer-events-auto"
      ref={(el) => {
        if (!el || el.dataset["ok"]) return;
        el.dataset["ok"] = "1";
        for (const ev of ["pointerdown", "mousedown", "focusin"]) el.addEventListener(ev, (e) => e.stopPropagation());
      }}
    >
      <TransformWrapper key={src} minScale={0.5} maxScale={8} doubleClick={{ mode: "toggle", step: 2 }} centerOnInit>
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <div className="flex items-center justify-between gap-2 p-3">
              <span className="text-background text-sm">{imgs.length > 1 ? `${idx + 1} de ${imgs.length}` : ""}</span>
              <div className="flex gap-2">
                <button className={btn} onClick={() => zoomOut()} aria-label="Diminuir zoom"><ZoomOut className="h-4 w-4" /></button>
                <button className={btn} onClick={() => zoomIn()} aria-label="Aumentar zoom"><ZoomIn className="h-4 w-4" /></button>
                <button className={btn} onClick={() => setRot((r) => r + 90)} aria-label="Girar"><RotateCw className="h-4 w-4" /></button>
                <button className={btn} onClick={() => { resetTransform(); setRot(0); }} aria-label="Ajustar"><Maximize className="h-4 w-4" /></button>
                <a className={btn} href={src} download target="_blank" rel="noreferrer" aria-label="Baixar"><Download className="h-4 w-4" /></a>
                <button className={btn} onClick={fechar} aria-label="Fechar"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="relative flex-1 overflow-hidden">
              <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <img
                  src={src}
                  alt={`Imagem ${idx + 1}`}
                  className="max-h-[80vh] max-w-[95vw] object-contain transition-transform"
                  style={{ transform: `rotate(${rot}deg)` }}
                  draggable={false}
                />
              </TransformComponent>
              {imgs.length > 1 && (
                <>
                  <button className={`${btn} absolute left-3 top-1/2 -translate-y-1/2 h-11 w-11`} onClick={() => ir(-1)} aria-label="Anterior"><ChevronLeft className="h-6 w-6" /></button>
                  <button className={`${btn} absolute right-3 top-1/2 -translate-y-1/2 h-11 w-11`} onClick={() => ir(1)} aria-label="Próxima"><ChevronRight className="h-6 w-6" /></button>
                </>
              )}
            </div>
            {imgs.length > 1 && (
              <div className="flex justify-center gap-2 overflow-x-auto p-3">
                {imgs.map((s, i) => (
                  <img
                    key={s}
                    src={s}
                    alt=""
                    onClick={() => { setIdx(i); setRot(0); }}
                    className={`h-12 w-12 cursor-pointer rounded object-cover ${i === idx ? "ring-2 ring-primary" : "opacity-60"}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </TransformWrapper>
    </div>,
    document.body,
  );
}
