import { createFileRoute } from "@tanstack/react-router";
import { CatalogoSaaS, modulosConfig } from "@/components/admin/CatalogoSaaS";

export const Route = createFileRoute("/_authenticated/admin/modulos")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Módulos Adicionais — Catálogo SaaS" },
      { name: "description", content: "Gestão dos módulos adicionais e funções liberadas por módulo." },
      { property: "og:title", content: "Módulos Adicionais — Catálogo SaaS" },
      { property: "og:description", content: "Gestão dos módulos adicionais e funções liberadas por módulo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <CatalogoSaaS config={modulosConfig} aba="modulos" />,
});
