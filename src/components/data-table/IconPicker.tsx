import { useMemo, useState, type ComponentType, type SVGProps } from "react";
import { Check, ChevronDown, icons, Search } from "lucide-react";
import {
  SiDiscord,
  SiFacebook,
  SiInstagram,
  SiMessenger,
  SiPinterest,
  SiSignal,
  SiSnapchat,
  SiTelegram,
  SiThreads,
  SiTiktok,
  SiWhatsapp,
  SiX,
  SiYoutube,
} from "@icons-pack/react-simple-icons";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type IconOption = {
  value: string;
  name: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const PAGE_SIZE = 120;

function toKebab(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[_\s]+/g, "-");
}

const BRAND_OPTIONS: IconOption[] = [
  { value: "brand-whatsapp", name: "WhatsApp", icon: SiWhatsapp },
  { value: "brand-instagram", name: "Instagram", icon: SiInstagram },
  { value: "brand-facebook", name: "Facebook", icon: SiFacebook },
  { value: "brand-messenger", name: "Messenger", icon: SiMessenger },
  { value: "brand-telegram", name: "Telegram", icon: SiTelegram },
  { value: "brand-youtube", name: "YouTube", icon: SiYoutube },
  { value: "brand-tiktok", name: "TikTok", icon: SiTiktok },
  { value: "brand-x", name: "X", icon: SiX },
  { value: "brand-threads", name: "Threads", icon: SiThreads },
  { value: "brand-discord", name: "Discord", icon: SiDiscord },
  { value: "brand-signal", name: "Signal", icon: SiSignal },
  { value: "brand-pinterest", name: "Pinterest", icon: SiPinterest },
  { value: "brand-snapchat", name: "Snapchat", icon: SiSnapchat },
];

const LUCIDE_OPTIONS: IconOption[] = Object.entries(icons)
  .map(([name, icon]) => ({ name, value: toKebab(name), icon }))
  .sort((a, b) => a.name.localeCompare(b.name));

const ICON_OPTIONS = [...BRAND_OPTIONS, ...LUCIDE_OPTIONS];

type IconPickerProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
};

export function IconPicker({ id, value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const normalizedValue = normalize(value);
  const selected = ICON_OPTIONS.find(
    (option) => option.value === normalizedValue || option.name.toLowerCase() === value.toLowerCase(),
  );
  const SelectedIcon = selected?.icon;

  const filtered = useMemo(() => {
    const search = normalize(query);
    if (!search) return ICON_OPTIONS;
    return ICON_OPTIONS.filter(
      (option) => option.value.includes(search) || option.name.toLowerCase().includes(search.replaceAll("-", "")),
    );
  }, [query]);

  const visible = filtered.slice(0, visibleCount);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setVisibleCount(PAGE_SIZE);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between px-3 font-normal"
        >
          <span className={cn("flex min-w-0 items-center gap-2", !selected && "text-muted-foreground")}>
            {SelectedIcon ? <SelectedIcon aria-hidden="true" /> : <Search aria-hidden="true" />}
            <span className="truncate">{selected?.name ?? (value || "Selecione um ícone Lucide")}</span>
          </span>
          <ChevronDown className="opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(30rem,var(--radix-popover-trigger-width))] p-0">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 size-4 shrink-0 opacity-50" aria-hidden="true" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="Buscar nos ícones Lucide…"
              className="h-10 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <CommandList className="max-h-80">
            {visible.length === 0 ? (
              <CommandEmpty>Nenhum ícone encontrado.</CommandEmpty>
            ) : (
              <CommandGroup heading={`${filtered.length} ícones disponíveis`}>
                <div className="grid grid-cols-3 gap-1 sm:grid-cols-4">
                  {visible.map((option) => {
                    const OptionIcon = option.icon;
                    return (
                      <Button
                        key={option.name}
                        type="button"
                        variant="ghost"
                        title={option.name}
                        className={cn(
                          "relative h-auto min-h-16 min-w-0 flex-col gap-1 rounded-sm px-1 py-2 text-center text-xs font-normal",
                          selected?.name === option.name && "bg-accent text-accent-foreground",
                        )}
                        onClick={() => {
                          onChange(option.value);
                          setOpen(false);
                        }}
                      >
                        <OptionIcon className="size-5" aria-hidden="true" />
                        <span className="w-full truncate">{option.name}</span>
                        {selected?.name === option.name && (
                          <Check className="absolute right-1 top-1 size-3" aria-hidden="true" />
                        )}
                      </Button>
                    );
                  })}
                </div>
              </CommandGroup>
            )}
          </CommandList>
          {visibleCount < filtered.length && (
            <div className="border-t p-2">
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                Mostrar mais ícones
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}