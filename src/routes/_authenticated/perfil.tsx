import { createFileRoute } from "@tanstack/react-router";
import { PerfisTab } from "@/components/usuarios/PerfisTab";

export const Route = createFileRoute("/_authenticated/perfil")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Perfis — Atende.ai" },
      { name: "description", content: "Cadastro dos perfis de acesso da plataforma." },
      { property: "og:title", content: "Perfis — Atende.ai" },
      { property: "og:description", content: "Cadastro dos perfis de acesso da plataforma." },
    ],
  }),
  component: PerfisTab,
});
