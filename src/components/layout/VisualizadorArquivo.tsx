import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ArquivoVisivel = { url: string; titulo: string; tipo?: string | undefined; nome?: string | undefined };
let ouvinte: ((a: ArquivoVisivel | null) => void) | null = null;

/** Abre qualquer arquivo dentro do sistema (modal), sem levar o usuário para outra aba. */
export function abrirArquivo(a: ArquivoVisivel) { ouvinte?.(a); }

function tipoDe(a: ArquivoVisivel) {
  const t = (a.tipo ?? "").toLowerCase();
  const ext = (a.nome || a.url.split("?")[0] || "").toLowerCase();
  if (t.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|avif)$/.test(ext)) return "imagem";
  if (t === "application/pdf" || /\.pdf$/.test(ext)) return "pdf";
  if (t.startsWith("video/") || /\.(mp4|webm|mov)$/.test(ext)) return "video";
  return "outro";
}

export function VisualizadorArquivoHost() {
  const [a, setA] = useState<ArquivoVisivel | null>(null);
  useEffect(() => { ouvinte = setA; return () => { ouvinte = null; }; }, []);
  const k = a ? tipoDe(a) : "outro";
  return (
    <Dialog open={!!a} onOpenChange={(o) => !o && setA(null)}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-6xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{a?.titulo}</DialogTitle>
          <DialogDescription className="sr-only">Visualização do arquivo. Pressione Esc para fechar.</DialogDescription>
        </DialogHeader>
        {a && (
          <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-muted/30">
            {k === "imagem" ? <img src={a.url} alt={a.titulo} className="size-full object-contain" />
              : k === "pdf" ? <iframe src={a.url} title={a.titulo} className="size-full" />
              : k === "video" ? <video src={a.url} controls className="size-full" aria-label={a.titulo} />
              : (
                <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <FileText className="size-12 text-muted-foreground" aria-hidden />
                  <p className="text-sm text-muted-foreground">Este tipo de arquivo não pode ser exibido aqui. Faça o download para abrir no seu dispositivo.</p>
                </div>
              )}
          </div>
        )}
        <DialogFooter className="gap-2">
          {a && <Button variant="outline" asChild><a href={a.url} download={a.nome || a.titulo}><Download className="size-4" aria-hidden /> Baixar</a></Button>}
          <Button onClick={() => setA(null)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
