import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/atendimentos")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search["id"] === "string" ? search["id"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Atendimentos — Atende.ai" },
      { name: "description", content: "Converse com as pessoas em um chat multicanal." },
      { property: "og:title", content: "Atendimentos — Atende.ai" },
      { property: "og:description", content: "Converse com as pessoas em um chat multicanal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AtendimentosPage,
});

function AtendimentosPage() {
  const { id } = Route.useSearch();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Atendimentos</h1>
      <div className="rounded-lg border border-border bg-card p-10 text-center text-muted-foreground">
        A tela de conversas será construída na próxima etapa.
        {id && <span className="mt-2 block text-sm">Atendimento selecionado: {id}</span>}
      </div>
    </div>
  );
}
