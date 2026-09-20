import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { useRealtimeRefresh } from "@/hooks/useRealtime";
import { getAllowedPaths, isPathAllowed } from "@/lib/access";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
    // Bloqueia acesso direto pela URL a telas não liberadas no menu
    // (vw_menu_usuario_perfil, perfil do usuário logado).
    const allowed = await getAllowedPaths(data.user.id, data.user.email ?? undefined);
    if (allowed && !isPathAllowed(location.pathname, allowed)) {
      toast.error("Você não tem acesso a esta página.");
      throw redirect({ to: "/dashboard" });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  useRealtimeRefresh();
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
