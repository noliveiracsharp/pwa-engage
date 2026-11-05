import { createFileRoute } from "@tanstack/react-router";
import { CondominiosPage } from "@/components/condominios/CondominiosPage";

export const Route = createFileRoute("/_authenticated/condominios")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Condomínios — Atende.ai" },
      { name: "description", content: "Gestão condominial: blocos, unidades, moradores, vagas e veículos." },
      { property: "og:title", content: "Condomínios — Atende.ai" },
      { property: "og:description", content: "Gestão condominial: blocos, unidades, moradores, vagas e veículos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CondominiosPage,
});
