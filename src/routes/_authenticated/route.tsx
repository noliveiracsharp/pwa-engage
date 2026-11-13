import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { SubmenuTabs } from "@/components/layout/SubmenuTabs";
import { useRealtimeRefresh } from "@/hooks/useRealtime";
import { FilaEnvioFlutuante } from "@/components/condominios/FilaEnvioFlutuante";
import { lerAmbiente, lerDestinoAmbiente } from "@/hooks/useAmbientes";
import { emModoUnidade, ROTAS_UNIDADE } from "@/lib/ambientes";
import { firstAllowedPath, getAllowedPathsCached, isPathAllowed } from "@/lib/access";

export const Route = createFileRoute("/_authenticated")({
  staticData: { sitemap: "exclude-subtree" },
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Sessão local (sem ida ao servidor); o token é validado em cada consulta.
    const { data: sess } = await supabase.auth.getSession();
    const data = { user: sess.session?.user };
    if (!data.user) throw redirect({ to: "/login" });
    // Dentro de uma unidade, só as telas do morador (o menu da empresa fica oculto).
    if (emModoUnidade(lerAmbiente()) && !ROTAS_UNIDADE.some((r) => location.pathname.startsWith(r))) {
      throw redirect({ to: (lerDestinoAmbiente() === "/condominios" ? "/condominios" : "/minha-unidade") as "/minha-unidade" });
    }
    // Bloqueia acesso direto pela URL a telas não liberadas no menu
    // (vw_menu_usuario_perfil, perfil do usuário logado).
    const allowed = await getAllowedPathsCached(data.user.id, data.user.email ?? undefined);
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
      <FilaEnvioFlutuante />
    </AppLayout>
  );
}
