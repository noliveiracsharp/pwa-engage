import { useEffect } from "react";
import { CalendarDays, Eye, FileText, Film, ImageIcon, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { abrirArquivo } from "@/components/layout/VisualizadorArquivo";
import { supabase } from "@/integrations/supabase/client";
import { TIPOS_AVISO } from "@/lib/cond-avisos";
import { htmlParaTexto } from "@/lib/html-texto";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";

const s = (v: unknown) => (v == null ? "" : String(v));
export const tipoAvisoLabel = (v: string) => TIPOS_AVISO.find((t) => t.value === v)?.label ?? (v || "Aviso");
export const tipoAvisoCor: Record<string, string> = {
  emergencia: "border-destructive/40 bg-destructive/10 text-destructive",
  assembleia: "border-primary/40 bg-primary/10 text-primary",
  obras: "border-warning/40 bg-warning/10 text-warning",
  financeiro: "border-success/40 bg-success/10 text-success",
};
const dtHora = (v: unknown) => (v ? new Date(s(v)).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

export function IconeMidia({ tipo, className }: { tipo: string; className?: string }) {
  return tipo === "imagem" ? <ImageIcon className={className} aria-hidden /> : tipo === "video" ? <Film className={className} aria-hidden /> : <FileText className={className} aria-hidden />;
}

/** Card clicável de aviso (portal do morador). */
export function CardAviso({ aviso, onAbrir, lido }: { aviso: Row; onAbrir: () => void; lido?: boolean }) {
  const tipo = s(aviso["tipo"]);
  return (
    <button type="button" onClick={onAbrir} aria-label={`Ler comunicado: ${s(aviso["titulo"])}`}
      className="group w-full rounded-2xl border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-2 md:space-y-1.5">
          <p className="text-sm text-foreground/75 md:text-xs md:text-muted-foreground">{s(aviso["abrangencia"]) || "Todas as torres"}</p>
          <p className="flex flex-wrap items-center gap-2 text-lg font-semibold leading-snug md:text-base">
            {lido === false && <span className="size-2 rounded-full bg-primary" aria-label="Não lido" />}
            {s(aviso["titulo"])}
            {s(aviso["midia_url"]) && <IconeMidia tipo={s(aviso["midia_tipo"])} className="size-4 text-primary" />}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm md:text-xs">
            <Badge variant="outline" className={`text-sm md:text-xs ${tipoAvisoCor[tipo] ?? ""}`}>{tipoAvisoLabel(tipo)}</Badge>
            <span className="text-foreground/75 md:text-muted-foreground">{dtHora(aviso["created_at"])}</span>
          </div>
          <p className="line-clamp-2 text-base leading-relaxed text-foreground/80 md:text-sm md:text-muted-foreground">{htmlParaTexto(s(aviso["mensagem"]))}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-base font-semibold text-primary md:text-xs md:font-medium md:opacity-80 group-hover:opacity-100"><Eye className="size-5 md:size-4" aria-hidden /> Ler</span>
      </div>
    </button>
  );
}

/** Modal com o comunicado completo; registra a leitura (canal sistema) quando informado o usuário. */
export function LeituraAvisoDialog({ aviso, usuarioId, onClose }: { aviso: Row | null; usuarioId?: string | undefined; onClose: () => void }) {
  useEffect(() => {
    if (!aviso || !usuarioId) return;
    // Melhor esforço: a leitura alimenta o relatório da gestão; falhas não atrapalham o morador.
    void (supabase as any).from("cond_avisos_leituras").upsert({ aviso_id: aviso["id"], usuario_id: usuarioId, canal: "sistema" }, { onConflict: "aviso_id,usuario_id,canal", ignoreDuplicates: true }).then(() => undefined, () => undefined);
  }, [aviso, usuarioId]);
  if (!aviso) return null;
  const tipo = s(aviso["tipo"]);
  const midia = s(aviso["midia_url"]);
  const midiaTipo = s(aviso["midia_tipo"]);
  const midiaNome = s(aviso["midia_nome"]) || "Anexo";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92dvh] max-w-3xl flex-col">
        <DialogHeader className="space-y-2 text-left">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className={tipoAvisoCor[tipo]}>{tipoAvisoLabel(tipo)}</Badge>
            <span className="text-muted-foreground">{s(aviso["abrangencia"]) || "Todas as torres"}</span>
          </div>
          <DialogTitle className="text-xl">{s(aviso["titulo"])}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-3 text-xs">
            <span className="flex items-center gap-1"><CalendarDays className="size-3.5" aria-hidden /> Publicado em {dtHora(aviso["created_at"])}</span>
            <span>{s(aviso["expira_em"]) ? `Visível até ${new Date(`${s(aviso["expira_em"]).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR")}` : "Não expira"}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {s(aviso["mensagem"]).trim()
            ? <div className="prose prose-sm max-w-none text-foreground dark:prose-invert [&_img]:max-w-full [&_img]:rounded-md" dangerouslySetInnerHTML={{ __html: s(aviso["mensagem"]) }} />
            : <p className="text-sm text-muted-foreground">Este comunicado não possui texto.</p>}
          {midia && (
            <section aria-label="Anexo" className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium"><Paperclip className="size-4" aria-hidden /> Anexo</p>
              {midiaTipo === "imagem" ? (
                <button type="button" onClick={() => abrirArquivo({ url: midia, titulo: midiaNome, nome: midiaNome })} className="block w-full overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ampliar imagem ${midiaNome}`}>
                  <img src={midia} alt={midiaNome} className="max-h-80 w-full object-contain" />
                </button>
              ) : midiaTipo === "video" ? (
                <video src={midia} controls className="max-h-80 w-full rounded-md bg-muted" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex size-12 items-center justify-center rounded bg-primary/10"><FileText className="size-6 text-primary" aria-hidden /></div>
                  <p className="min-w-0 flex-1 truncate text-sm">{midiaNome}</p>
                  <Button size="sm" onClick={() => abrirArquivo({ url: midia, titulo: midiaNome, nome: midiaNome, tipo: "application/pdf" })}><Eye className="size-4" aria-hidden /> Visualizar</Button>
                </div>
              )}
            </section>
          )}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose} className={cn()}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
