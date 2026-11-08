import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2, ChevronRight, Home, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { gravarAmbiente, useAmbientes } from "@/hooks/useAmbientes";
import { destinoDoAmbiente, precisaEscolher, type Ambiente } from "@/lib/ambientes";

export const Route = createFileRoute("/_authenticated/acesso")({
  head: () => ({
    meta: [
      { title: "Onde deseja entrar? — Atende.ai" },
      { name: "description", content: "Escolha entre a gestão da empresa e as suas unidades em condomínios." },
      { property: "og:title", content: "Onde deseja entrar? — Atende.ai" },
      { property: "og:description", content: "Escolha entre a gestão da empresa e as suas unidades em condomínios." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AcessoPage,
});

function AcessoPage() {
  const navigate = useNavigate();
  const { data: ambientes, isLoading } = useAmbientes();

  const entrar = (a: Ambiente) => {
    gravarAmbiente(a.id);
    navigate({ to: destinoDoAmbiente(a) as "/dashboard", replace: true });
  };

  useEffect(() => {
    if (!ambientes) return;
    if (ambientes.length === 0) navigate({ to: "/dashboard", replace: true });
    else if (!precisaEscolher(ambientes)) entrar(ambientes[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambientes]);

  if (isLoading || !ambientes || !precisaEscolher(ambientes)) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando" /></div>;
  }

  return (
    <div className="mx-auto max-w-2xl py-8">
      <h1 className="text-2xl font-bold text-foreground">Onde deseja entrar?</h1>
      <p className="mt-1 text-sm text-muted-foreground">Você tem mais de um acesso. Pode trocar a qualquer momento pelo menu do seu nome, no topo.</p>
      <div className="mt-6 space-y-3">
        {ambientes.map((a) => {
          const Icone = a.tipo === "empresa" ? Building2 : Home;
          return (
            <Card key={a.id} className="transition-colors hover:border-primary">
              <CardContent className="p-0">
                <button type="button" onClick={() => entrar(a)} className="flex w-full items-center gap-4 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icone className="h-6 w-6" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">{a.tipo === "empresa" ? "Gestão da empresa" : "Condomínio"}</span>
                    <span className="block truncate font-semibold text-foreground">{a.titulo}</span>
                    <span className="block truncate text-sm text-muted-foreground">{a.subtitulo}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
