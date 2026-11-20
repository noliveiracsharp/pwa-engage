import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Renderiza todas as páginas do PDF (pdfjs) com rolagem contínua — necessário no celular, onde o iframe mostra só a 1ª página. */
export function PdfPaginas({ url, titulo }: { url: string; titulo: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [total, setTotal] = useState(0);
  const [atual, setAtual] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [erro, setErro] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    const el = box.current;
    if (!el) return;
    el.innerHTML = "";
    setCarregando(true); setErro(false);
    (async () => {
      try {
        const pdfjs = await (await import("@/lib/pdf-worker")).prepararPdfjs();
        const doc = await pdfjs.getDocument({ url }).promise;
        if (!vivo) return;
        setTotal(doc.numPages);
        const largura = Math.max(280, el.clientWidth - 16) * zoom;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let i = 1; i <= doc.numPages && vivo; i++) {
          const p = await doc.getPage(i);
          const v1 = p.getViewport({ scale: 1 });
          const vp = p.getViewport({ scale: (largura / v1.width) * dpr });
          const c = document.createElement("canvas");
          c.width = vp.width; c.height = vp.height;
          c.style.width = `${largura}px`; c.style.height = `${vp.height / dpr}px`;
          c.dataset["pagina"] = String(i);
          c.setAttribute("role", "img");
          c.setAttribute("aria-label", `${titulo} — página ${i} de ${doc.numPages}`);
          c.className = "mx-auto mb-3 block rounded bg-white shadow";
          el.appendChild(c);
          await p.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport: vp } as never).promise;
          if (i === 1) setCarregando(false);
        }
      } catch { if (vivo) { setErro(true); setCarregando(false); } }
    })();
    return () => { vivo = false; };
  }, [url, zoom, titulo]);

  const aoRolar = () => {
    const el = box.current; if (!el) return;
    const meio = el.scrollTop + el.clientHeight / 3;
    let n = 1;
    for (const c of Array.from(el.children) as HTMLElement[]) { if (c.offsetTop <= meio) n = Number(c.dataset["pagina"]) || n; }
    setAtual(n);
  };

  return (
    <div className="flex size-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b bg-background px-2 py-1.5">
        <span className="text-base font-medium" aria-live="polite">{total ? `Página ${atual} de ${total}` : "Carregando…"}</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-11" aria-label="Diminuir zoom" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}><ZoomOut className="size-5" /></Button>
          <span className="w-12 text-center text-sm">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" className="size-11" aria-label="Aumentar zoom" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.5))}><ZoomIn className="size-5" /></Button>
          <Button variant="ghost" size="icon" className="size-11" asChild><a href={url} target="_blank" rel="noopener noreferrer" aria-label="Abrir em tela cheia"><ExternalLink className="size-5" /></a></Button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={box} onScroll={aoRolar} className="absolute inset-0 overflow-auto p-2" style={{ touchAction: "pan-x pan-y pinch-zoom" }} />
        {carregando && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="size-8 animate-spin text-muted-foreground" aria-label="Carregando PDF" /></div>}
        {erro && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"><p className="text-sm text-muted-foreground">Não foi possível exibir o PDF aqui.</p><Button asChild><a href={url} target="_blank" rel="noopener noreferrer">Abrir em tela cheia</a></Button></div>}
      </div>
    </div>
  );
}

/** Celular/tablet (toque ou tela estreita): o iframe nativo não pagina PDF. */
export function precisaPdfJs() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 1024px)").matches || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}
