import { useEffect, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNotificacoesChat } from "@/hooks/useNotificacoesChat";

export function AppLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useNotificacoesChat();

  // No celular, qualquer navegação fecha o menu.
  useEffect(() => { if (isMobile) setOpen(false); }, [pathname, isMobile]);

  return (
    <div className="flex h-dvh w-full flex-col bg-background">
      <AppHeader onToggleSidebar={() => setOpen((v) => !v)} />
      <div className="relative flex min-h-0 flex-1">
        {isMobile ? (
          <>
            {open && (
              <div
                className="fixed inset-x-0 bottom-0 top-16 z-30 bg-foreground/40"
                onClick={() => setOpen(false)}
                aria-hidden
              />
            )}
            <div
              className={cn(
                "fixed bottom-0 left-0 top-16 z-40 transition-transform duration-200",
                open ? "translate-x-0" : "-translate-x-full",
              )}
            >
              <AppSidebar open onNavigate={() => setOpen(false)} />
            </div>
          </>
        ) : (
          <AppSidebar open={open} />
        )}
        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
