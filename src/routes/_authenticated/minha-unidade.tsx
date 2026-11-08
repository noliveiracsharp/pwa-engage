import { createFileRoute, Link } from "@tanstack/react-router";
import { Home, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { lerAmbiente, useAmbientes } from "@/hooks/useAmbientes";
import { rotuloPapel } from "@/lib/ambientes";

export const Route = createFileRoute("/_authenticated/minha-unidade")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Minha unidade — Atende.ai" },
      { name: "description", content: "Dados da sua unidade no condomínio." },
      { property: "og:title", content: "Minha unidade — Atende.ai" },
      { property: "og:description", content: "Dados da sua unidade no condomínio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MinhaUnidade,
});

function MinhaUnidade() {
  const { data: ambientes, isLoading } = useAmbientes();
  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando" /></div>;
  const unidades = (ambientes ?? []).filter((a) => a.tipo === "unidade");
  const atual = unidades.find((a) => a.id === lerAmbiente()) ?? unidades[0];
  if (!atual || atual.tipo !== "unidade") {
    return <div className="py-12 text-center text-muted-foreground">Você não tem unidade vinculada. <Link to="/acesso" className="text-primary underline">Voltar</Link></div>;
  }
  const v = atual.vinculo;
  return (
    <div className="mx-auto max-w-3xl space-y-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Condomínio</p>
          <h1 className="text-2xl font-bold text-foreground">{v.condominio_nome}</h1>
        </div>
        {(ambientes?.length ?? 0) > 1 && <Button variant="outline" asChild><Link to="/acesso">Trocar acesso</Link></Button>}
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Home className="h-5 w-5 text-primary" /> Minha unidade</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 text-sm">
          {v.bloco && <span className="font-medium">{v.bloco}</span>}
          <span className="font-medium">Unidade {v.numero}</span>
          <Badge variant="secondary">{rotuloPapel(v.papel)}</Badge>
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">Comunicados, documentos, reservas e visitantes da sua unidade vão aparecer aqui.</p>
    </div>
  );
}
