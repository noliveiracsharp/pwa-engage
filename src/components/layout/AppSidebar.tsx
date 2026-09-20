import { Link, useRouterState } from "@tanstack/react-router";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useMenu } from "@/hooks/useMenu";
import { getIcon } from "./icon-map";

type Props = {
  open: boolean;
  onNavigate?: () => void;
};

export function AppSidebar({ open, onNavigate }: Props) {
  const { data: items = [], isLoading } = useMenu();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <TooltipProvider delayDuration={100}>
      <nav
        className={cn(
          "flex h-full flex-col gap-1 overflow-y-auto border-r border-sidebar-border bg-sidebar p-2 transition-[width] duration-200",
          open ? "w-60" : "w-16",
        )}
      >
        {isLoading && <div className="px-3 py-2 text-xs text-muted-foreground">Carregando…</div>}
        {items.map((item) => {
          const Icon = getIcon(item.icon);
          const active = pathname === item.path || pathname.startsWith(item.path + "/");
          const link = (
            <Link
              key={item.id}
              to={item.path as "/dashboard"}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                active && "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary",
                !open && "justify-center px-0",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {open && <span className="truncate">{item.label}</span>}
            </Link>
          );

          if (open) return link;
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}
