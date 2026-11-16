import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MeusDadosSheet } from "@/components/perfil/MeusDadosSheet";

export const Route = createFileRoute("/_authenticated/meus-dados")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Meus Dados — ConectCon HUB" },
      { name: "description", content: "Edite seus dados de cadastro, foto, e-mail e senha no ConectCon HUB." },
      { property: "og:title", content: "Meus Dados — ConectCon HUB" },
      { property: "og:description", content: "Edite seus dados de cadastro, foto, e-mail e senha no ConectCon HUB." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MeusDados,
});

function MeusDados() {
  const navigate = useNavigate();
  return <MeusDadosSheet open onOpenChange={(v) => !v && navigate({ to: "/dashboard" })} />;
}
