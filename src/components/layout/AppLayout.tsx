import { useState, type ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

export function AppLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <AppHeader onToggleSidebar={() => setOpen((v) => !v)} />
      <div className="relative flex min-h-0 flex-1">
        {isMobile ? (
          <>
            {open && (
              <div
                className="fixed inset-0 top-16 z-30 bg-foreground/40"
                onClick={() => setOpen(false)}
                aria-hidden
              />
            )}
            <div
              className={cn(
                "fixed inset-y-16 left-0 z-40 transition-transform duration-200",
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
