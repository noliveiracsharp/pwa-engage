import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { RotateCcw, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Entry = { active: boolean; reset: () => void };
type Registry = { set: (id: string, e: Entry | null) => void };
const FilterCtx = createContext<Registry | null>(null);

/** Registers a filter field: its value at mount is the "clean" value. */
function useRegister(value: string, onChange: (v: string) => void) {
  const reg = useContext(FilterCtx);
  const id = useId();
  const initial = useRef(value);
  useEffect(() => {
    reg?.set(id, { active: value !== initial.current, reset: () => onChange(initial.current) });
  });
  useEffect(() => () => reg?.set(id, null), [reg, id]);
}

/** Wraps a filter bar and shows "Limpar filtros" when any field differs from its initial value. */
export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  const entries = useRef(new Map<string, Entry>());
  const [count, setCount] = useState(0);
  const set = useCallback((id: string, e: Entry | null) => {
    if (e) entries.current.set(id, e);
    else entries.current.delete(id);
    const n = [...entries.current.values()].filter((x) => x.active).length;
    setCount((c) => (c === n ? c : n));
  }, []);
  const reg = useRef<Registry>({ set }).current;

  // Resets one field per render so pages using stale `{...f}` updates don't clobber each other.
  const limpar = (guard = 0) => {
    const next = [...entries.current.values()].find((x) => x.active);
    if (!next || guard > 20) return;
    next.reset();
    setTimeout(() => limpar(guard + 1), 0);
  };

  return (
    <FilterCtx.Provider value={reg}>
      <div className={className}>
        {children}
        {count > 0 && (
          <div className="col-span-full flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => limpar()}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Limpar filtros ({count})
            </Button>
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
  useRegister(value, onChange);
  return (
    <div>
      <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={value ? "pr-8" : undefined} />
        {value && (
          <button
            type="button"
            aria-label="Limpar busca"
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
  useRegister(value, onChange);
  return (
    <div>
      <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder="Todos" />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
