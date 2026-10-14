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

type Props = {
  open: boolean;
  onNavigate?: () => void;
};

const linkCls =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
const activeCls = "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary";

function isActive(item: MenuItem, pathname: string): boolean {
  return (
    pathname === item.path ||
    pathname.startsWith(item.path + "/") ||
    (item.path === "/admin/planos" && pathname === "/admin/modulos")
  );
}

function hasActiveChild(item: MenuItem, pathname: string): boolean {
  return (item.children ?? []).some((c) => isActive(c, pathname) || hasActiveChild(c, pathname));
}

export function AppSidebar({ open, onNavigate }: Props) {
  const { data: items = [], isLoading } = useMenu();
  const ativa = useEmpresaAtiva();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

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
        {isLoading && <div className="px-3 py-2 text-xs text-muted-foreground">Carregando…</div>}
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
  const Icon = getIcon(item.icon);
  const children = item.children ?? [];
  const childActive = hasActiveChild(item, pathname);
  const [expanded, setExpanded] = useState(childActive);
  useEffect(() => { if (childActive) setExpanded(true); }, [childActive]);

  if (children.length === 0) {
    const link = (
      <Link
        to={item.path as "/dashboard"}
        onClick={onNavigate}
        className={cn(linkCls, isActive(item, pathname) && activeCls, !open && "justify-center px-0")}
        style={open && depth > 0 ? { paddingLeft: 12 + depth * 16 } : undefined}
      >
        <Icon className={cn("shrink-0", depth > 0 ? "h-4 w-4" : "h-5 w-5")} />
        {open && <span className="truncate">{item.label}</span>}
      </Link>
    );
    if (open) return link;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
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
            title={item.label}
            className={cn(linkCls, "justify-center px-0", (childActive || isActive(item, pathname)) && activeCls)}
          >
            <Icon className="h-5 w-5 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" align="start" className="w-56 p-1">
          <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">{item.label}</div>
          <Link
            to={item.path as "/dashboard"}
            onClick={onNavigate}
            className={cn(linkCls, "text-popover-foreground", isActive(item, pathname) && activeCls)}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
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
                <span className="truncate">{c.label}</span>
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
        <Link
          to={item.path as "/dashboard"}
          onClick={onNavigate}
          className={cn(linkCls, "min-w-0 flex-1", isActive(item, pathname) && activeCls)}
          style={depth > 0 ? { paddingLeft: 12 + depth * 16 } : undefined}
        >
          <Icon className={cn("shrink-0", depth > 0 ? "h-4 w-4" : "h-5 w-5")} />
          <span className="truncate">{item.label}</span>
        </Link>
        <button
          type="button"
          aria-label={expanded ? `Recolher ${item.label}` : `Expandir ${item.label}`}
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
