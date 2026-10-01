import { useMemo, useState, type ElementType } from "react";
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
  icon: ElementType;
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


// Dicionário PT-BR -> termos em inglês dos ícones
const PT_TERMS: Record<string, string[]> = {
  usuario: ["user"], usuarios: ["users"], pessoa: ["user", "person"], pessoas: ["users"], cliente: ["user", "contact"],
  empresa: ["building", "factory"], predio: ["building"], casa: ["house", "home"], inicio: ["house", "home"],
  configuracao: ["settings", "cog", "sliders"], configuracoes: ["settings", "cog"], engrenagem: ["cog", "settings"],
  dinheiro: ["dollar", "banknote", "coins", "wallet"], financeiro: ["dollar", "banknote", "wallet", "landmark"],
  pagamento: ["credit-card", "wallet", "banknote"], cartao: ["credit-card"], carteira: ["wallet"], banco: ["landmark"],
  moeda: ["coins", "dollar"], grafico: ["chart"], relatorio: ["chart", "file-text", "clipboard"], dashboard: ["layout-dashboard", "gauge"],
  painel: ["layout-dashboard", "panel"], estoque: ["package", "boxes", "warehouse"], caixa: ["box", "package"], produto: ["package", "box"],
  produtos: ["package", "boxes"], item: ["package", "box"], itens: ["package", "boxes"], servico: ["wrench", "hammer", "briefcase"],
  ferramenta: ["wrench", "hammer"], marca: ["tag", "badge"], etiqueta: ["tag", "tags"], orcamento: ["calculator", "receipt", "file-text"],
  calculadora: ["calculator"], nota: ["receipt", "file-text", "sticky-note"], recibo: ["receipt"], documento: ["file", "file-text"],
  arquivo: ["file", "folder", "archive"], pasta: ["folder"], mensagem: ["message", "mail"], chat: ["message"], conversa: ["message"],
  email: ["mail"], correio: ["mail"], telefone: ["phone"], celular: ["smartphone", "phone"], atendimento: ["headset", "headphones", "message"],
  suporte: ["headset", "life-buoy"], calendario: ["calendar"], agenda: ["calendar"], data: ["calendar"], relogio: ["clock"], hora: ["clock"],
  tempo: ["clock", "timer"], busca: ["search"], pesquisa: ["search"], lupa: ["search"], adicionar: ["plus"], mais: ["plus"],
  remover: ["minus", "trash"], excluir: ["trash", "x"], lixeira: ["trash"], editar: ["pencil", "pen", "edit"], lapis: ["pencil"],
  salvar: ["save"], fechar: ["x"], sair: ["log-out"], entrar: ["log-in"], cadeado: ["lock"], seguranca: ["shield", "lock"],
  chave: ["key"], permissao: ["shield", "key", "lock"], perfil: ["user", "id-card"], funcao: ["shield", "briefcase", "list"],
  menu: ["menu", "list"], lista: ["list"], tabela: ["table", "sheet"], quadro: ["kanban", "layout"], kanban: ["kanban", "columns"],
  estrela: ["star"], favorito: ["star", "heart", "bookmark"], coracao: ["heart"], curtir: ["thumbs-up", "heart"], alerta: ["alert", "triangle-alert", "bell"],
  aviso: ["alert", "info"], sino: ["bell"], notificacao: ["bell"], informacao: ["info"], ajuda: ["help", "circle-help"], duvida: ["help"],
  imagem: ["image"], foto: ["image", "camera"], camera: ["camera"], video: ["video", "film"], audio: ["audio", "mic", "volume"], musica: ["music"],
  microfone: ["mic"], som: ["volume", "speaker"], mapa: ["map"], local: ["map-pin"], endereco: ["map-pin", "map"], localizacao: ["map-pin", "locate"],
  caminhao: ["truck"], entrega: ["truck", "package"], frete: ["truck"], carro: ["car"], loja: ["store", "shopping"], carrinho: ["shopping-cart"],
  compra: ["shopping", "cart"], venda: ["shopping", "badge-dollar", "handshake"], fornecedor: ["truck", "factory"], parceiro: ["handshake", "users"],
  fabrica: ["factory"], industria: ["factory"], escritorio: ["briefcase", "building"], trabalho: ["briefcase"], maleta: ["briefcase"],
  nuvem: ["cloud"], download: ["download"], baixar: ["download"], enviar: ["send", "upload"], upload: ["upload"], compartilhar: ["share"],
  link: ["link"], impressora: ["printer"], imprimir: ["printer"], computador: ["monitor", "laptop"], tela: ["monitor"], banco_de_dados: ["database"],
  dados: ["database"], servidor: ["server"], codigo: ["code"], filtro: ["filter", "funnel"], ordenar: ["arrow-up-down", "sort"], seta: ["arrow"],
  olho: ["eye"], ver: ["eye"], visualizar: ["eye"], ocultar: ["eye-off"], centro_custo: ["landmark", "network"], hierarquia: ["network", "git-fork"],
  unidade: ["ruler", "scale"], medida: ["ruler", "scale"], regua: ["ruler"], balanca: ["scale"], peso: ["weight", "scale"], check: ["check"],
  confirmar: ["check"], sol: ["sun"], lua: ["moon"], tema: ["palette", "sun", "moon"], cor: ["palette"], livro: ["book"], escola: ["school", "graduation"],
  saude: ["heart-pulse", "stethoscope", "hospital"], hospital: ["hospital"], comida: ["utensils", "pizza"], restaurante: ["utensils"], cafe: ["coffee"],
  presente: ["gift"], trofeu: ["trophy"], meta: ["target", "goal"], alvo: ["target"], foguete: ["rocket"], raio: ["zap"], energia: ["zap", "battery"],
};

function stripAccents(v: string) {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function expandSearch(raw: string): string[] {
  const q = stripAccents(raw.trim().toLowerCase());
  if (!q) return [];
  const terms = new Set<string>([q.replace(/[_\s]+/g, "-")]);
  const key = q.replace(/[\s-]+/g, "_");
  for (const [pt, en] of Object.entries(PT_TERMS)) {
    if (pt === key || (key.length >= 3 && pt.startsWith(key))) en.forEach((t) => terms.add(t));
  }
  return [...terms];
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
    const terms = expandSearch(query);
    if (!terms.length) return ICON_OPTIONS;
    return ICON_OPTIONS.filter((option) =>
      terms.some((t) => option.value.includes(t) || option.name.toLowerCase().includes(t.replaceAll("-", ""))),
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
            <span className="truncate">{selected?.name ?? (value || "Selecione um ícone")}</span>
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
              placeholder="Buscar ícone (ex.: dinheiro, usuário, estoque)…"
              className="h-10 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <CommandList
            className="max-h-80 overflow-y-auto overscroll-contain"
            onWheel={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
            onScroll={(event) => {
              const el = event.currentTarget;
              if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40 && visibleCount < filtered.length) {
                setVisibleCount((count) => count + PAGE_SIZE);
              }
            }}
          >
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