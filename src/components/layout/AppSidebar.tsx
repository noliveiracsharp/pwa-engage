import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useMenu, type MenuItem } from "@/hooks/useMenu";
import { getIcon } from "./icon-map";
import { ChatInterno } from "@/components/chat-interno/ChatInterno";
import { VersaoSidebar } from "./NovidadesDialog";
import { useEmpresaAtiva } from "@/hooks/useEmpresaAtiva";
import { useIdioma } from "@/lib/i18n";
import { rotuloMenu } from "@/lib/i18n-menu";
import { useTableRows } from "@/lib/crud";
import { A } from "@/lib/atendimentos";

/** Conversas com mensagens novas ainda não lidas (selo no menu Atendimentos). */
function useNovasConversas(ativo: boolean) {
  const { data = [] } = useTableRows("atendimentos", ativo);
  if (!ativo) return 0;
  return data.filter((a) => { const c = A.naoLidas.find((k) => k in a); return c ? Number(a[c]) > 0 : false; }).length;
}

type Props = {
  open: boolean;
  onNavigate?: () => void;
};

const linkCls =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
const activeCls = "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary";

// Caminhos de todos os itens do menu: só o mais específico que casa fica ativo.
let todosPaths: string[] = [];

function casa(path: string, pathname: string) {
  return pathname === path || pathname.startsWith(path + "/");
}

function isActive(item: MenuItem, pathname: string): boolean {
  if (!item.path) return false;
  if (item.path === "/admin/planos" && pathname === "/admin/modulos") return true;
  if (!casa(item.path, pathname)) return false;
  return !todosPaths.some((p) => p.length > item.path!.length && casa(p, pathname));
}

function hasActiveChild(item: MenuItem, pathname: string): boolean {
  return (item.children ?? []).some((c) => isActive(c, pathname) || hasActiveChild(c, pathname));
}

export function AppSidebar({ open, onNavigate }: Props) {
  const { data: items = [], isLoading } = useMenu();
  const ativa = useEmpresaAtiva();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { t } = useIdioma();
  todosPaths = flatten(items).map((i) => i.path).filter((p): p is string => !!p);

  return (
    <TooltipProvider delayDuration={100}>
      <nav
        className={cn(
          "flex h-full flex-col gap-1 overflow-y-auto border-r border-sidebar-border bg-sidebar p-2 transition-[width] duration-200",
          open ? "w-60" : "w-16",
        )}
      >
        {open && (
          <div className="mb-2 flex items-center justify-center border-b border-sidebar-border px-2 pb-3 pt-1">
            {ativa.logoAtivo
              ? <img src={ativa.logoAtivo} alt={ativa.nome} className="h-10 w-auto max-w-full object-contain" />
              : <span className="truncate text-base font-bold text-sidebar-foreground">{ativa.nome}</span>}
          </div>
        )}
        {isLoading && <div className="px-3 py-2 text-xs text-muted-foreground">{t("msg.carregando")}</div>}
        {items.map((item) => (
          <SidebarEntry key={item.id} item={item} open={open} pathname={pathname} onNavigate={onNavigate} depth={0} />
        ))}
        <div className="mt-auto flex flex-col gap-1 border-t border-sidebar-border pt-2">
          <ChatInterno sidebarOpen={open} onAbrir={onNavigate} />
          <VersaoSidebar open={open} />
        </div>
      </nav>
    </TooltipProvider>
  );
}

function SidebarEntry({
  item, open, pathname, onNavigate, depth,
}: { item: MenuItem; open: boolean; pathname: string; onNavigate?: (() => void) | undefined; depth: number }) {
  const { idioma } = useIdioma();
  const rotulo = rotuloMenu(idioma, item.path, item.label);
  const Icon = getIcon(item.icon);
  const children = item.children ?? [];
  const novas = useNovasConversas(item.path === "/atendimentos");
  const selo = novas > 0 ? (
    <span className={cn("rounded-full bg-destructive px-1.5 text-[10px] font-semibold leading-4 text-destructive-foreground", open ? "ml-auto" : "absolute right-1 top-1")} aria-label={`${novas} conversas novas`}>{novas > 99 ? "99+" : novas}</span>
  ) : null;
  const childActive = hasActiveChild(item, pathname);
  const [expanded, setExpanded] = useState(childActive);
  useEffect(() => { if (childActive) setExpanded(true); }, [childActive]);

  if (children.length === 0) {
    const link = (
      <Link
        to={item.path as "/dashboard"}
        onClick={onNavigate}
        aria-label={open ? undefined : rotulo}
        className={cn(linkCls, "relative", isActive(item, pathname) && activeCls, !open && "justify-center px-0")}
        style={open && depth > 0 ? { paddingLeft: 12 + depth * 16 } : undefined}
      >
        <Icon className={cn("shrink-0", depth > 0 ? "h-4 w-4" : "h-5 w-5")} />
        {open && <span className="truncate">{rotulo}</span>}
        {selo}
      </Link>
    );
    if (open) return link;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{rotulo}</TooltipContent>
      </Tooltip>
    );
  }

  // Sidebar recolhida: ícone do pai abre lista flutuante com os submenus.
  if (!open) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={rotulo}
            className={cn(linkCls, "justify-center px-0", (childActive || isActive(item, pathname)) && activeCls)}
          >
            <Icon className="h-5 w-5 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" align="start" className="w-56 p-1">
          <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">{rotulo}</div>
{item.path && (
          <Link
            to={item.path as "/dashboard"}
            onClick={onNavigate}
            className={cn(linkCls, "text-popover-foreground", isActive(item, pathname) && activeCls)}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{rotulo}</span>
          </Link>
          )}
          {flatten(children).map((c) => {
            const CIcon = getIcon(c.icon);
            return (
              <Link
                key={c.id}
                to={c.path as "/dashboard"}
                onClick={onNavigate}
                className={cn(linkCls, "text-popover-foreground", isActive(c, pathname) && activeCls)}
              >
                <CIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">{rotuloMenu(idioma, c.path, c.label)}</span>
              </Link>
            );
          })}
        </PopoverContent>
      </Popover>
    );
  }

  // Sidebar aberta: o pai navega para a própria tela e a seta expande os submenus.
  return (
    <div className="flex flex-col gap-1">
      <div className={cn("flex items-center rounded-md", isActive(item, pathname) && activeCls)}>
        {item.path ? (
        <Link
          to={item.path as "/dashboard"}
          onClick={onNavigate}
          className={cn(linkCls, "min-w-0 flex-1", isActive(item, pathname) && activeCls)}
          style={depth > 0 ? { paddingLeft: 12 + depth * 16 } : undefined}
        >
          <Icon className={cn("shrink-0", depth > 0 ? "h-4 w-4" : "h-5 w-5")} />
          <span className="truncate">{rotulo}</span>
        </Link>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={cn(linkCls, "min-w-0 flex-1 text-left")}
            style={depth > 0 ? { paddingLeft: 12 + depth * 16 } : undefined}
          >
            <Icon className={cn("shrink-0", depth > 0 ? "h-4 w-4" : "h-5 w-5")} />
            <span className="truncate">{rotulo}</span>
          </button>
        )}
        <button
          type="button"
          aria-label={expanded ? `Recolher ${rotulo}` : `Expandir ${rotulo}`}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="rounded-md p-2 text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
      {expanded && (
        <div className="ml-3 flex flex-col gap-1 border-l border-sidebar-border">
          {children.map((c) => (
            <SidebarEntry key={c.id} item={c} open pathname={pathname} onNavigate={onNavigate} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function flatten(list: MenuItem[]): MenuItem[] {
  return list.flatMap((i) => [i, ...flatten(i.children ?? [])]);
}
