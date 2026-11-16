import { createFileRoute } from "@tanstack/react-router";
import { PerfisTab } from "@/components/usuarios/PerfisTab";

export const Route = createFileRoute("/_authenticated/perfil")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Perfis — ConectCon HUB" },
      { name: "description", content: "Cadastro dos perfis de acesso da plataforma." },
      { property: "og:title", content: "Perfis — ConectCon HUB" },
      { property: "og:description", content: "Cadastro dos perfis de acesso da plataforma." },
    ],
  }),
  component: PerfisTab,
});
