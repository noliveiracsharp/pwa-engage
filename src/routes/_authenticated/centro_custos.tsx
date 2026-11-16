import { createFileRoute } from "@tanstack/react-router";
import { ApoioCrud } from "@/components/itens/ApoioCrud";
import { centroCustoConfig } from "@/components/itens/apoio-config";

export const Route = createFileRoute("/_authenticated/centro_custos")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Centros de Custo — ConectCon HUB" },
      { name: "description", content: "Cadastro dos centros de custo para classificação de produtos e serviços." },
      { property: "og:title", content: "Centros de Custo — ConectCon HUB" },
      { property: "og:description", content: "Cadastro dos centros de custo para classificação de produtos e serviços." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <ApoioCrud {...centroCustoConfig} />,
});
