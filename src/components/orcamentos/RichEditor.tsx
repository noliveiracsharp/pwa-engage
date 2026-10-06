import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Braces,
  Code2,
  Eraser,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Palette,
  Pilcrow,
  SquareDashed,
  Underline,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { paraHtml, TAGS } from "@/lib/propostas";

/* Cores neutras/da marca: ficam no HTML salvo e precisam ser fixas para sair iguais no PDF. */
const CORES = ["#0b2545", "#13426f", "#0ea5e9", "#0e7490", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#13263f", "#64748b"];
const REALCES = ["#e0f2fe", "#dcfce7", "#fef3c7", "#fee2e2", "#ede9fe", "#f1f5f9"];

const CAIXAS: { label: string; html: string }[] = [
  {
    label: "Destaque (garantia)",
    html: '<div class="prop-box prop-box-info"><strong>Garantia total</strong><p>Se algo não entregar o prometido, ajustamos sem custo.</p></div><p></p>',
  },
  {
    label: "Sucesso / benefício",
    html: '<div class="prop-box prop-box-ok"><strong>Resultado</strong><p>Descreva o benefício principal.</p></div><p></p>',
  },
  {
    label: "Aviso importante",
    html: '<div class="prop-box prop-box-alerta"><strong>Importante</strong><p>Descreva a condição.</p></div><p></p>',
  },
];

type Props = { value: string; onChange: (html: string) => void; minHeight?: number };

/** Editor visual (contentEditable) com alternância para código HTML. */
export function RichEditor({ value, onChange, minHeight = 160 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [modo, setModo] = useState<"visual" | "html">("visual");
  const ultimo = useRef<string>("");

  // Sincroniza conteúdo externo (carregar modelo, troca de orçamento) sem perder o cursor ao digitar.
  useEffect(() => {
    if (modo !== "visual" || !ref.current) return;
    const html = paraHtml(value);
    if (html !== ultimo.current) {
      ref.current.innerHTML = html;
      ultimo.current = html;
    }
  }, [value, modo]);

  const emitir = () => {
    const html = ref.current?.innerHTML ?? "";
    ultimo.current = html;
    onChange(html);
  };

  const cmd = (c: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(c, false, arg);
    emitir();
  };

  const B = ({ t, on, children }: { t: string; on: () => void; children: React.ReactNode }) => (
    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title={t} aria-label={t}
      onMouseDown={(e) => e.preventDefault()} onClick={on}>
      {children}
    </Button>
  );

  return (
    <div className="rounded-md border bg-background">
      <div className="flex flex-wrap items-center gap-0.5 border-b p-1">
        {modo === "visual" && (
          <>
            <B t="Negrito" on={() => cmd("bold")}><Bold className="h-3.5 w-3.5" /></B>
            <B t="Itálico" on={() => cmd("italic")}><Italic className="h-3.5 w-3.5" /></B>
            <B t="Sublinhado" on={() => cmd("underline")}><Underline className="h-3.5 w-3.5" /></B>
            <B t="Título" on={() => cmd("formatBlock", "h2")}><Heading2 className="h-3.5 w-3.5" /></B>
            <B t="Subtítulo" on={() => cmd("formatBlock", "h3")}><Heading3 className="h-3.5 w-3.5" /></B>
            <B t="Parágrafo" on={() => cmd("formatBlock", "p")}><Pilcrow className="h-3.5 w-3.5" /></B>
            <B t="Lista" on={() => cmd("insertUnorderedList")}><List className="h-3.5 w-3.5" /></B>
            <B t="Lista numerada" on={() => cmd("insertOrderedList")}><ListOrdered className="h-3.5 w-3.5" /></B>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Cor do texto" onMouseDown={(e) => e.preventDefault()}>
                  <Palette className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
                <p className="mb-1 text-xs text-muted-foreground">Cor do texto</p>
                <div className="grid grid-cols-5 gap-1">
                  {CORES.map((c) => (
                    <button key={c} type="button" className="h-6 w-6 rounded border" style={{ background: c }}
                      onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("foreColor", c)} aria-label={c} />
                  ))}
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs">
                  Personalizada
                  <input type="color" onChange={(e) => cmd("foreColor", e.target.value)} />
                </label>
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Realce" onMouseDown={(e) => e.preventDefault()}>
                  <Highlighter className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="grid grid-cols-6 gap-1">
                  {REALCES.map((c) => (
                    <button key={c} type="button" className="h-6 w-6 rounded border" style={{ background: c }}
                      onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("hiliteColor", c)} aria-label={c} />
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Inserir caixa" onMouseDown={(e) => e.preventDefault()}>
                  <SquareDashed className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
                {CAIXAS.map((c) => (
                  <DropdownMenuItem key={c.label} onSelect={() => cmd("insertHTML", c.html)}>{c.label}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Inserir variável" onMouseDown={(e) => e.preventDefault()}>
                  <Braces className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent onCloseAutoFocus={(e) => e.preventDefault()}>
                {TAGS.map((t) => (
                  <DropdownMenuItem key={t} onSelect={() => cmd("insertText", t)}>{t}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <B t="Limpar formatação" on={() => cmd("removeFormat")}><Eraser className="h-3.5 w-3.5" /></B>
          </>
        )}
        <Button type="button" variant={modo === "html" ? "secondary" : "ghost"} size="sm" className="ml-auto h-7 text-xs"
          onClick={() => {
            if (modo === "visual") onChange(paraHtml(value));
            ultimo.current = "";
            setModo(modo === "visual" ? "html" : "visual");
          }}>
          <Code2 className="mr-1 h-3.5 w-3.5" /> {modo === "visual" ? "HTML" : "Visual"}
        </Button>
      </div>
      {modo === "visual" ? (
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emitir}
          className="prop-rich max-h-[420px] overflow-y-auto p-3 text-sm outline-none"
          style={{ minHeight }}
        />
      ) : (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[200px] rounded-none border-0 font-mono text-xs focus-visible:ring-0"
        />
      )}
    </div>
  );
}
