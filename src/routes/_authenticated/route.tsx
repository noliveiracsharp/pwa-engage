import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { SubmenuTabs } from "@/components/layout/SubmenuTabs";
import { useRealtimeRefresh } from "@/hooks/useRealtime";
import { firstAllowedPath, getAllowedPaths, isPathAllowed } from "@/lib/access";

export const Route = createFileRoute("/_authenticated")({
  staticData: { sitemap: "exclude-subtree" },
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
    // Bloqueia acesso direto pela URL a telas não liberadas no menu
    // (vw_menu_usuario_perfil, perfil do usuário logado).
    const allowed = await getAllowedPaths(data.user.id, data.user.email ?? undefined);
    if (allowed && !isPathAllowed(location.pathname, allowed)) {
      const destino = firstAllowedPath(allowed);
      if (location.pathname !== "/dashboard" && destino !== "/sem-acesso") toast.error("Você não tem acesso a esta página.");
      throw redirect({ to: destino as "/sem-acesso" });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  useRealtimeRefresh();
  return (
    <AppLayout>
      <SubmenuTabs>
        <Outlet />
      </SubmenuTabs>
    </AppLayout>
  );
}
