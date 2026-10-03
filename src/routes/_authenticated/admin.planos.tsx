import { createFileRoute } from "@tanstack/react-router";
import { CatalogoSaaS, planosConfig } from "@/components/admin/CatalogoSaaS";

export const Route = createFileRoute("/_authenticated/admin/planos")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Planos Base — Catálogo SaaS" },
      { name: "description", content: "Gestão dos planos base comercializados pelo ERP." },
      { property: "og:title", content: "Planos Base — Catálogo SaaS" },
      { property: "og:description", content: "Gestão dos planos base comercializados pelo ERP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <CatalogoSaaS config={planosConfig} aba="planos" />,
});
