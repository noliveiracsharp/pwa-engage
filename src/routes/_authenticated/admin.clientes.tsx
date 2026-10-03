import { createFileRoute } from "@tanstack/react-router";
import { GestaoClientes } from "@/components/admin/GestaoClientes";

export const Route = createFileRoute("/_authenticated/admin/clientes")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Gestão de Clientes — Backoffice" },
      { name: "description", content: "Empresas do sistema, planos contratados e estado das assinaturas." },
      { property: "og:title", content: "Gestão de Clientes — Backoffice" },
      { property: "og:description", content: "Empresas do sistema, planos contratados e estado das assinaturas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GestaoClientes,
});
