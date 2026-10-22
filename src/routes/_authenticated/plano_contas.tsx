import { createFileRoute } from "@tanstack/react-router";
import { ApoioCrud } from "@/components/itens/ApoioCrud";
import { planoContasConfig } from "@/components/itens/apoio-config";

export const Route = createFileRoute("/_authenticated/plano_contas")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Plano de Contas — Atende.ai" },
      { name: "description", content: "Plano de contas gerencial em árvore para classificar receitas, custos e despesas no DRE." },
      { property: "og:title", content: "Plano de Contas — Atende.ai" },
      { property: "og:description", content: "Plano de contas gerencial em árvore para classificar receitas, custos e despesas no DRE." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <ApoioCrud {...planoContasConfig} />,
});
