import { termo, termoNo } from "@/lib/i18n-termos";
import { useIdioma, tr } from "@/lib/i18n";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Entry = { active: boolean; reset: () => void; busca?: boolean; chip?: string };
type Registry = { set: (id: string, e: Entry | null) => void };
const FilterCtx = createContext<Registry | null>(null);

/** Text-search fields stay visible while the advanced filter panel is closed. */
export const ehBusca = (label: string) => /^(buscar|pesquisar|busca|search|procurar)/i.test(label.trim());

/** Registers a filter field: its value at mount is the "clean" value. */
function useRegister(value: string, onChange: (v: string) => void, meta?: { busca?: boolean; chip?: string }) {
  const reg = useContext(FilterCtx);
  const id = useId();
  const initial = useRef(value);
  useEffect(() => {
    reg?.set(id, { active: value !== initial.current, reset: () => onChange(initial.current), ...meta });
  });
  useEffect(() => () => reg?.set(id, null), [reg, id]);
}

/**
 * Filter bar: text search always visible; other filters collapse behind a "Filtros (n)" button,
 * with active filters shown as removable chips.
 */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  const entries = useRef(new Map<string, Entry>());
  const [, setVersao] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [temAvancado, setTemAvancado] = useState(true);
  const grade = useRef<HTMLDivElement>(null);
  const set = useCallback((id: string, e: Entry | null) => {
    const antes = entries.current.get(id);
    if (e) entries.current.set(id, e);
    else entries.current.delete(id);
    if (antes?.active !== e?.active || antes?.chip !== e?.chip) setVersao((v) => v + 1);
  }, []);
  const reg = useRef<Registry>({ set }).current;

  useLayoutEffect(() => {
    const el = grade.current;
    if (!el) return;
    const n = [...el.children].filter((c) => !(c as HTMLElement).dataset["busca"] && !(c as HTMLElement).dataset["fixo"]).length;
    setTemAvancado((t) => (t === n > 0 ? t : n > 0));
  });

  const ativos = [...entries.current.values()].filter((x) => x.active);
  const avancados = ativos.filter((x) => !x.busca);

  // Resets one field per render so pages using stale `{...f}` updates don't clobber each other.
  const limpar = (guard = 0) => {
    const next = [...entries.current.values()].find((x) => x.active);
    if (!next || guard > 20) return;
    next.reset();
    setTimeout(() => limpar(guard + 1), 0);
  };

  return (
    <FilterCtx.Provider value={reg}>
      <div ref={grade} className={cn(className, !aberto && "[&>*:not([data-busca]):not([data-fixo])]:hidden")}>
        {children}
        {temAvancado && (
          <div data-fixo="1" className={cn("flex items-end gap-2", aberto && "col-span-full justify-end")}>
            {aberto ? (
              <>
                {ativos.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => limpar()}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> Limpar filtros
                  </Button>
                )}
                <Button type="button" size="sm" onClick={() => setAberto(false)}>
                  <Check className="mr-1 h-3.5 w-3.5" /> Aplicar filtros
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" onClick={() => setAberto(true)} aria-expanded={false}>
                <SlidersHorizontal className="mr-2 h-4 w-4" /> Filtros{avancados.length ? ` (${avancados.length})` : ""}
                <ChevronDown className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
        {!aberto && avancados.length > 0 && (
          <div data-fixo="1" className="col-span-full flex flex-wrap items-center gap-1.5">
            {avancados.map((e, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-foreground">
                {e.chip ?? "Filtro"}
                <button type="button" aria-label="Remover filtro" onClick={e.reset} className="rounded-full text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => limpar()}>Limpar tudo</Button>
          </div>
        )}
      </div>
    </FilterCtx.Provider>
  );
}

export function FilterInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const busca = ehBusca(label);
  const { idioma } = useIdioma();
  const rotulo = termo(idioma, label);
  useRegister(value, onChange, { busca, chip: `${rotulo}: ${value}` });
  const id = useId();
  label = rotulo;
  return (
    <div data-busca={busca ? "1" : undefined}>
      <Label htmlFor={id} className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input id={id} type="search" aria-label={label} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={value ? "pr-8" : undefined} />
        {value && (
          <button
            type="button"
            aria-label={tr("acao.limparSelecao")}
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}): ReactNode {
  const { idioma } = useIdioma();
  const rotulo = termo(idioma, label);
  const opt = options.find((o) => o.value === value);
  useRegister(value, onChange, { chip: `${rotulo}: ${opt ? termo(idioma, opt.label) : value}` });
  const id = useId();
  label = rotulo;
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue placeholder={tr("filtro.todos")} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {termo(idioma, opt.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
