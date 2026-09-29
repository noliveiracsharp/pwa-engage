import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
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

  return (
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
          <span className="truncate">{selected ? selected.label : placeholder}</span>
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
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
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
                  <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                  {opt.hint && (
                    <span className="text-muted-foreground ml-2 shrink-0 text-xs">{opt.hint}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
