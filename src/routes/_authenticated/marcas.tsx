import { createFileRoute } from "@tanstack/react-router";
import { ApoioCrud } from "@/components/itens/ApoioCrud";
import { marcaConfig } from "@/components/itens/apoio-config";

export const Route = createFileRoute("/_authenticated/marcas")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Marcas — ConectCon HUB" },
      { name: "description", content: "Cadastro das marcas e fabricantes vinculados aos produtos." },
      { property: "og:title", content: "Marcas — ConectCon HUB" },
      { property: "og:description", content: "Cadastro das marcas e fabricantes vinculados aos produtos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <ApoioCrud {...marcaConfig} />,
});
