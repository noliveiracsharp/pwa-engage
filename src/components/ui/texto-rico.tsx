import { useEffect, useRef } from "react";
import { Bold, Eraser, Highlighter, Italic, List, ListOrdered, Palette, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/* Cores fixas: ficam gravadas no texto e precisam sair iguais no e-mail/PDF. */
const CORES = ["#0b2545", "#2563eb", "#0e7490", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#64748b"];
const REALCES = ["#fef3c7", "#dcfce7", "#e0f2fe", "#fee2e2", "#ede9fe"];

const esc = (s: string) => s.replace(/&(?![a-z]+;|#\d+;)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Desfaz codificações em cascata antigas (&amp;amp;nbsp; → &nbsp;). */
const limparEntidades = (s: string) => {
  let r = s;
  while (/&amp;(amp;|nbsp;|lt;|gt;|quot;|#\d+;)/.test(r)) r = r.replace(/&amp;(amp;|nbsp;|lt;|gt;|quot;|#\d+;)/g, "&$1");
  return r;
};
/** Texto simples antigo vira HTML com quebras de linha; HTML é mantido. */
export const textoParaHtml = (v: string) => {
  const s = limparEntidades(v);
  return /<[a-z][\s\S]*>|&[a-z]+;|&#\d+;/i.test(s) ? s : esc(s).replace(/\n/g, "<br>");
};

type Props = { value: string; onChange: (html: string) => void; minHeight?: number; disabled?: boolean; placeholder?: string; className?: string };

/** Editor de texto com negrito, itálico, sublinhado, cores, realce e listas. Grava HTML. */
export function TextoRico({ value, onChange, minHeight = 120, disabled, placeholder, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const ultimo = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const v = value ?? "";
    // Valor que acabamos de emitir: não reescrever (evita salto do cursor e recodificação).
    if (v === ultimo.current || (v === "" && ultimo.current === "<br>")) return;
    if (document.activeElement === el && ultimo.current !== null) return;
    const html = textoParaHtml(v);
    if (html !== el.innerHTML) el.innerHTML = html;
    ultimo.current = v;
  }, [value]);

  const emitir = () => {
    const html = ref.current?.innerHTML ?? "";
    ultimo.current = html;
    onChange(html === "<br>" ? "" : html);
  };
  const cmd = (c: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(c, false, arg);
    emitir();
  };
  const B = ({ t, c, arg, children }: { t: string; c: string; arg?: string; children: React.ReactNode }) => (
    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title={t} aria-label={t} disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} onClick={() => cmd(c, arg)}>{children}</Button>
  );
  const Paleta = ({ t, cores, c, icon }: { t: string; cores: string[]; c: string; icon: React.ReactNode }) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title={t} aria-label={t} disabled={disabled} onMouseDown={(e) => e.preventDefault()}>{icon}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="flex gap-1">
          {cores.map((cor) => (
            <button key={cor} type="button" className="h-6 w-6 rounded border border-border" style={{ background: cor }} aria-label={cor}
              onMouseDown={(e) => e.preventDefault()} onClick={() => cmd(c, cor)} />
          ))}
          <input type="color" className="h-6 w-6" aria-label="Cor personalizada" onChange={(e) => cmd(c, e.target.value)} />
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <div className={cn("rounded-md border border-input bg-background", disabled && "opacity-60", className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border p-1">
        <B t="Negrito" c="bold"><Bold className="h-3.5 w-3.5" /></B>
        <B t="Itálico" c="italic"><Italic className="h-3.5 w-3.5" /></B>
        <B t="Sublinhado" c="underline"><Underline className="h-3.5 w-3.5" /></B>
        <Paleta t="Cor do texto" cores={CORES} c="foreColor" icon={<Palette className="h-3.5 w-3.5" />} />
        <Paleta t="Marca-texto" cores={REALCES} c="hiliteColor" icon={<Highlighter className="h-3.5 w-3.5" />} />
        <B t="Lista" c="insertUnorderedList"><List className="h-3.5 w-3.5" /></B>
        <B t="Lista numerada" c="insertOrderedList"><ListOrdered className="h-3.5 w-3.5" /></B>
        <B t="Limpar formatação" c="removeFormat"><Eraser className="h-3.5 w-3.5" /></B>
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emitir}
        onBlur={emitir}
        className="prose prose-sm max-w-none px-3 py-2 text-sm text-foreground outline-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        style={{ minHeight }}
      />
    </div>
  );
}
