import { useState } from "react";
import {
  BarChart3,
  Bell,
  Bot,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Clock3,
  Cloud,
  Contact,
  Database,
  FileText,
  FolderKanban,
  Gauge,
  Globe2,
  Headphones,
  HeartHandshake,
  House,
  Inbox,
  Kanban,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Link,
  ListChecks,
  LockKeyhole,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Package,
  PanelTop,
  Phone,
  PlugZap,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Star,
  Tags,
  TicketCheck,
  User,
  UserCog,
  Users,
  UsersRound,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type IconOption = {
  value: string;
  label: string;
  icon: LucideIcon;
  keywords?: string;
};

const ICON_OPTIONS: IconOption[] = [
  { value: "layout-dashboard", label: "Dashboard", icon: LayoutDashboard, keywords: "painel início" },
  { value: "house", label: "Início", icon: House, keywords: "home casa" },
  { value: "building-2", label: "Empresa", icon: Building2, keywords: "organização prédio" },
  { value: "users", label: "Clientes", icon: Users, keywords: "pessoas grupo" },
  { value: "user-cog", label: "Usuários", icon: UserCog, keywords: "conta perfil" },
  { value: "user", label: "Usuário", icon: User, keywords: "pessoa conta" },
  { value: "users-round", label: "Equipe", icon: UsersRound, keywords: "time pessoas" },
  { value: "contact", label: "Contato", icon: Contact, keywords: "agenda cliente" },
  { value: "shield-check", label: "Funções e acesso", icon: ShieldCheck, keywords: "segurança permissão" },
  { value: "key-round", label: "Chave", icon: KeyRound, keywords: "acesso senha" },
  { value: "lock-keyhole", label: "Protegido", icon: LockKeyhole, keywords: "segurança bloqueio" },
  { value: "kanban", label: "Kanban", icon: Kanban, keywords: "quadro etapas" },
  { value: "folder-kanban", label: "Projetos", icon: FolderKanban, keywords: "quadro pasta" },
  { value: "message-circle", label: "Atendimento", icon: MessageCircle, keywords: "chat conversa" },
  { value: "messages-square", label: "Conversas", icon: MessagesSquare, keywords: "chat mensagens" },
  { value: "headphones", label: "Suporte", icon: Headphones, keywords: "atendimento ajuda" },
  { value: "life-buoy", label: "Ajuda", icon: LifeBuoy, keywords: "suporte" },
  { value: "inbox", label: "Caixa de entrada", icon: Inbox, keywords: "mensagens atendimento" },
  { value: "send", label: "Enviar", icon: Send, keywords: "mensagem" },
  { value: "mail", label: "E-mail", icon: Mail, keywords: "mensagem carta" },
  { value: "phone", label: "Telefone", icon: Phone, keywords: "ligação contato" },
  { value: "smartphone", label: "Celular", icon: Smartphone, keywords: "telefone whatsapp" },
  { value: "bot", label: "Inteligência artificial", icon: Bot, keywords: "robô ia automação" },
  { value: "sparkles", label: "Automação", icon: Sparkles, keywords: "ia destaque" },
  { value: "zap", label: "Ação rápida", icon: Zap, keywords: "raio automação" },
  { value: "settings", label: "Configurações", icon: Settings, keywords: "ajustes engrenagem" },
  { value: "wrench", label: "Ferramentas", icon: Wrench, keywords: "ajustes manutenção" },
  { value: "plug-zap", label: "Integrações", icon: PlugZap, keywords: "conexão" },
  { value: "database", label: "Dados", icon: Database, keywords: "banco armazenamento" },
  { value: "cloud", label: "Nuvem", icon: Cloud, keywords: "online" },
  { value: "globe-2", label: "Web", icon: Globe2, keywords: "internet mundo" },
  { value: "link", label: "Link", icon: Link, keywords: "conexão endereço" },
  { value: "bar-chart-3", label: "Relatórios", icon: BarChart3, keywords: "gráfico dados" },
  { value: "gauge", label: "Indicadores", icon: Gauge, keywords: "velocidade painel" },
  { value: "file-text", label: "Documento", icon: FileText, keywords: "arquivo texto" },
  { value: "clipboard-list", label: "Lista", icon: ClipboardList, keywords: "tarefas formulário" },
  { value: "list-checks", label: "Tarefas", icon: ListChecks, keywords: "lista checklist" },
  { value: "calendar-days", label: "Agenda", icon: CalendarDays, keywords: "calendário data" },
  { value: "clock-3", label: "Horários", icon: Clock3, keywords: "tempo relógio" },
  { value: "bell", label: "Notificações", icon: Bell, keywords: "alerta sino" },
  { value: "star", label: "Avaliações", icon: Star, keywords: "favorito nota" },
  { value: "tags", label: "Etiquetas", icon: Tags, keywords: "categorias" },
  { value: "ticket-check", label: "Chamados", icon: TicketCheck, keywords: "ticket suporte" },
  { value: "briefcase-business", label: "Negócios", icon: BriefcaseBusiness, keywords: "trabalho empresa" },
  { value: "circle-dollar-sign", label: "Financeiro", icon: CircleDollarSign, keywords: "dinheiro cobrança" },
  { value: "shopping-cart", label: "Vendas", icon: ShoppingCart, keywords: "carrinho compras" },
  { value: "package", label: "Produtos", icon: Package, keywords: "caixa estoque" },
  { value: "map-pin", label: "Localização", icon: MapPin, keywords: "mapa endereço" },
  { value: "megaphone", label: "Campanhas", icon: Megaphone, keywords: "marketing anúncio" },
  { value: "heart-handshake", label: "Relacionamento", icon: HeartHandshake, keywords: "parceria cliente" },
  { value: "panel-top", label: "Página", icon: PanelTop, keywords: "tela janela" },
  { value: "search", label: "Pesquisa", icon: Search, keywords: "buscar lupa" },
];

type IconPickerProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
};

export function IconPicker({ id, value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = ICON_OPTIONS.find((option) => option.value === value);
  const SelectedIcon = selected?.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
            <span className="truncate">{selected?.label ?? (value || "Selecione um ícone")}</span>
          </span>
          <ChevronDown className="opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,var(--radix-popover-trigger-width))] p-0">
        <Command>
          <CommandInput placeholder="Buscar ícone…" />
          <CommandList>
            <CommandEmpty>Nenhum ícone encontrado.</CommandEmpty>
            <CommandGroup heading="Ícones">
              {ICON_OPTIONS.map((option) => {
                const OptionIcon = option.icon;
                return (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.value} ${option.keywords ?? ""}`}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <OptionIcon aria-hidden="true" />
                    <span>{option.label}</span>
                    <Check className={cn("ml-auto", value === option.value ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}