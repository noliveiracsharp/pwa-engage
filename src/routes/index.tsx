import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@/components/landing/LandingPage";

const TITLE = "Atende.ai — WhatsApp, Orçamentos e Projetos em uma só plataforma";
const DESC =
  "Centralize atendimentos WhatsApp com IA, gerencie funis de vendas em Kanban, calcule orçamentos com juros automáticos e organize projetos.";

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  ssr: false,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://pwa-engage.lovable.app/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://pwa-engage.lovable.app/" }],
  }),
  component: LandingPage,
});
