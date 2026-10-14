import { useState } from "react";
import { Check, ChevronsUpDown, X, ZoomIn } from "lucide-react";
import { ImagensCarrosselDialog } from "@/components/itens/ImagensCarrosselDialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type SearchOption = {
  value: string;
  label: string;
  /** Texto secundário à direita (ex.: preço, documento). */
  hint?: string | undefined;
  /** Termos extras para a busca (código, documento…). */
  keywords?: string[] | undefined;
  /** Nível na hierarquia (recuo visual na lista). */
  depth?: number | undefined;
  /** Fotos da opção: mostra miniatura e permite ampliar. */
  images?: string[] | undefined;
};

type Props = {
  id?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean | undefined;
  allowClear?: boolean;
  className?: string | undefined;
};

/** Select com busca (Popover + Command) para listas grandes: clientes, itens… */
export function SearchSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Selecione",
  searchPlaceholder = "Buscar…",
  emptyText = "Nenhum resultado.",
  disabled,
  allowClear = true,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const [zoom, setZoom] = useState<SearchOption | null>(null);
  const thumb = (opt: SearchOption, size: string) =>
    opt.images?.[0] ? (
      <span
        role="button"
        tabIndex={-1}
        title="Ampliar foto"
        aria-label="Ampliar foto"
        className={cn("group relative shrink-0 cursor-zoom-in overflow-hidden rounded border", size)}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setZoom(opt);
        }}
      >
        <img src={opt.images[0]} alt="" className="h-full w-full object-cover" />
        <span className="bg-background/60 absolute inset-0 hidden items-center justify-center group-hover:flex">
          <ZoomIn className="h-3.5 w-3.5" />
        </span>
      </span>
    ) : null;

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-10 w-full justify-between px-3 font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected && thumb(selected, "h-7 w-7")}
            <span className="truncate">{selected ? selected.label : placeholder}</span>
          </span>
          <span className="ml-2 flex shrink-0 items-center gap-1">
            {allowClear && selected && !disabled && (
              <span
                role="button"
                aria-label="Limpar seleção"
                tabIndex={-1}
                className="text-muted-foreground hover:text-foreground rounded-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 max-w-[95vw] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.value}
                  keywords={[opt.label, ...(opt.keywords ?? [])]}
                  onSelect={() => {
                    onChange(opt.value === value && allowClear ? "" : opt.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      opt.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {thumb(opt, "mr-2 h-10 w-10")}
                  <span
                    className="flex min-w-0 flex-1 flex-col"
                    style={opt.depth ? { paddingLeft: `${opt.depth * 1.1}rem` } : undefined}
                  >
                    <span className={cn("break-words whitespace-normal", opt.depth === 0 && "font-semibold")}>
                      {opt.depth ? "↳ " : ""}
                      {opt.label}
                    </span>
                    {opt.hint && (
                      <span className="text-muted-foreground text-xs break-words whitespace-normal">
                        {opt.hint}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
    <ImagensCarrosselDialog
      open={!!zoom}
      onOpenChange={(o) => !o && setZoom(null)}
      titulo={zoom?.label ?? ""}
      imagens={zoom?.images ?? []}
    />
    </>
  );
}
