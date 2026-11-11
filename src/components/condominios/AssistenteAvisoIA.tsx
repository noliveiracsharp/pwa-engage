import { useState } from "react";
import { ImageIcon, Loader2, RotateCcw, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { gerarImagemAvisoIA, redigirAvisoIA } from "@/lib/marketing-consultor.functions";
import { TIPOS_AVISO } from "@/lib/cond-avisos";
import { cn } from "@/lib/utils";

type Tom = "informativo" | "cordial" | "firme" | "urgente";
const TONS: { value: Tom; label: string; dica: string }[] = [
  { value: "informativo", label: "Informativo", dica: "Claro e direto" },
  { value: "cordial", label: "Cordial", dica: "Regras de convivência" },
  { value: "firme", label: "Firme", dica: "Infrações e notificações" },
  { value: "urgente", label: "Urgente", dica: "Imprevistos e alertas" },
];
export type SugestaoAviso = { titulo: string; tipo: string; html: string; imagem?: string };

export function AssistenteAvisoIA({ open, onOpenChange, condominio, onAplicar }: { open: boolean; onOpenChange: (o: boolean) => void; condominio: string; onAplicar: (s: SugestaoAviso) => void }) {
  const [ideia, setIdeia] = useState("");
  const [tom, setTom] = useState<Tom>("informativo");
  const [gerando, setGerando] = useState(false);
  const [sug, setSug] = useState<SugestaoAviso | null>(null);
  const [comImagem, setComImagem] = useState(false);

  const [gerandoImg, setGerandoImg] = useState(false);

  async function gerarImagem() {
    if (ideia.trim().length < 5) return;
    setGerandoImg(true);
    try {
      const { data } = await supabase.auth.getSession();
      const im = await gerarImagemAvisoIA({ data: { ideia: ideia.trim(), token: data.session?.access_token ?? "" } });
      if (im.erro) toast.error(im.erro);
      else if (im.imagem) setSug((s) => (s ? { ...s, imagem: im.imagem } : s));
    } catch { toast.error("Não foi possível criar a imagem agora. O texto foi mantido; clique em Tentar gerar imagem."); }
    setGerandoImg(false);
  }

  async function gerar() {
    if (ideia.trim().length < 5) { toast.error("Conte um pouco mais sobre o que precisa comunicar."); return; }
    setGerando(true);
    let ok = false;
    try {
      const { data } = await supabase.auth.getSession();
      const r = await redigirAvisoIA({ data: { ideia: ideia.trim(), tom, condominio, token: data.session?.access_token ?? "" } });
      if (r.erro) toast.error(r.erro); else { setSug({ titulo: r.titulo, tipo: r.tipo, html: r.html }); ok = true; }
    } catch { toast.error("Não foi possível redigir o aviso agora."); }
    setGerando(false);
    if (ok && comImagem) void gerarImagem();
  }

  const tipoLabel = TIPOS_AVISO.find((t) => t.value === sug?.tipo)?.label;

  return (
    <Dialog open={open} onOpenChange={(o) => !gerando && onOpenChange(o)}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2"><Wand2 className="size-5 text-primary" aria-hidden /> Redigir aviso com IA</DialogTitle>
          <DialogDescription>Escreva do seu jeito o que precisa avisar. A IA monta o título e o texto; você revisa antes de enviar.</DialogDescription>
        </DialogHeader>
        <div className="-mx-6 min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-2">
          <div>
            <Label htmlFor="ia-ideia" className="mb-1.5 block">O que você precisa comunicar?</Label>
            <Textarea id="ia-ideia" value={ideia} onChange={(e) => setIdeia(e.target.value)} rows={4} maxLength={3000} disabled={gerando}
              placeholder="Ex.: manutenção do elevador social na quinta das 9h às 14h, usar o de serviço"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) gerar(); }} />
            <p className="mt-1 text-xs text-muted-foreground">Dica: inclua datas, horários e o que o morador deve fazer. Ctrl+Enter gera.</p>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Tom do comunicado</legend>
            <div role="radiogroup" aria-label="Tom do comunicado" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TONS.map((t) => (
                <button key={t.value} type="button" role="radio" aria-checked={tom === t.value} disabled={gerando} onClick={() => setTom(t.value)}
                  className={cn("rounded-lg border p-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40", tom === t.value ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "hover:border-primary/50")}>
                  <span className="block font-semibold">{t.label}</span><span className="text-xs text-muted-foreground">{t.dica}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3">
            <span className="flex items-center gap-2 text-sm"><ImageIcon className="size-4 text-primary" aria-hidden /><span><span className="block font-medium">Gerar imagem ilustrativa</span><span className="text-xs text-muted-foreground">A IA cria uma ilustração sem texto para o topo do aviso</span></span></span>
            <Switch checked={comImagem} onCheckedChange={setComImagem} disabled={gerando} aria-label="Gerar imagem ilustrativa" />
          </label>
          <div aria-live="polite">
            {gerando && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> Redigindo o comunicado…</p>}
            {sug && !gerando && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Sugestão{tipoLabel ? ` · ${tipoLabel}` : ""}</p>
                {gerandoImg && <div role="status" className="flex aspect-square w-full items-center justify-center gap-2 rounded-md border bg-muted text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> Criando ilustração…</div>}
                {!gerandoImg && comImagem && <Button type="button" variant="outline" size="sm" onClick={gerarImagem}><ImageIcon className="size-4" aria-hidden /> {sug.imagem ? "Gerar outra imagem" : "Tentar gerar imagem"}</Button>}
                {!gerandoImg && sug.imagem && <img src={sug.imagem} alt="Imagem ilustrativa sugerida pela IA" className="w-full rounded-md border object-cover" />}
                <p className="font-semibold">{sug.titulo}</p>
                <div className="prose prose-sm max-w-none text-sm text-foreground [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: sug.html }} />
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="-mx-6 -mb-6 shrink-0 border-t bg-background px-6 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gerando}>Cancelar</Button>
          {sug ? (
            <>
              <Button variant="outline" onClick={gerar} disabled={gerando}><RotateCcw className="size-4" aria-hidden /> Gerar de novo</Button>
              <Button disabled={gerando || gerandoImg} onClick={() => { onAplicar(sug); onOpenChange(false); setSug(null); setIdeia(""); }}>Usar no aviso</Button>
            </>
          ) : (
            <Button onClick={gerar} disabled={gerando || ideia.trim().length < 5}>{gerando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wand2 className="size-4" aria-hidden />} Gerar comunicado</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
