import { createFileRoute } from "@tanstack/react-router";
import { ShieldOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sem-acesso")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Sem acesso — Atende.ai" },
      { name: "description", content: "Seu perfil ainda não possui telas liberadas." },
      { property: "og:title", content: "Sem acesso — Atende.ai" },
      { property: "og:description", content: "Seu perfil ainda não possui telas liberadas." },
    ],
  }),
  component: SemAcesso,
});

function SemAcesso() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <ShieldOff className="h-12 w-12 text-muted-foreground" />
      <h1 className="text-xl font-semibold">Sem acesso liberado</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Seu perfil ainda não possui nenhuma tela liberada. Fale com o administrador do sistema.
      </p>
    </div>
  );
}
