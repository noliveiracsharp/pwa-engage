import { createFileRoute } from "@tanstack/react-router";
import { ApoioCrud } from "@/components/itens/ApoioCrud";
import { unidadeConfig } from "@/components/itens/apoio-config";

export const Route = createFileRoute("/_authenticated/unid_medida")({
  head: () => ({
    meta: [
      { title: "Unidades de Medida — Atende.ai" },
      { name: "description", content: "Cadastro das unidades de medida usadas nos produtos e serviços." },
      { property: "og:title", content: "Unidades de Medida — Atende.ai" },
      { property: "og:description", content: "Cadastro das unidades de medida usadas nos produtos e serviços." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <ApoioCrud {...unidadeConfig} />,
});
