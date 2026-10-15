import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { buscarMarca, lembrarSlug, normalizarSlug, SLUGS_RESERVADOS } from "@/lib/marca-publica";

export const Route = createFileRoute("/$slug")({
  staticData: { sitemap: false },
  ssr: false,
  head: () => ({
    meta: [
      { title: "Acesso da empresa — Atende.ai" },
      { name: "description", content: "Entre no Atende.ai pelo endereço exclusivo da sua empresa." },
      { property: "og:title", content: "Acesso da empresa — Atende.ai" },
      { property: "og:description", content: "Entre no Atende.ai pelo endereço exclusivo da sua empresa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SlugPage,
});

function SlugPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const [naoEncontrada, setNaoEncontrada] = useState(false);

  useEffect(() => {
    const s = normalizarSlug(slug);
    if (!s || SLUGS_RESERVADOS.has(s)) { setNaoEncontrada(true); return; }
    buscarMarca(s).then((m) => {
      if (!m) { setNaoEncontrada(true); return; }
      lembrarSlug(s);
      navigate({ to: "/login", search: { e: s } as never, replace: true });
    });
  }, [slug, navigate]);

  if (naoEncontrada) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-6xl font-bold text-foreground">404</h1>
          <p className="mt-3 text-muted-foreground">Não encontramos nenhuma empresa ou página neste endereço.</p>
          <Link to="/login" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Ir para o login</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
