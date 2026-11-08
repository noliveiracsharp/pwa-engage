import { useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Building2, ChevronRight, Home, Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { gravarAmbiente, useAmbientes } from "@/hooks/useAmbientes";
import { destinoDoAmbiente, filtrarAmbientes, precisaEscolher, type Ambiente } from "@/lib/ambientes";

export const Route = createFileRoute("/acesso")({
  staticData: { sitemap: false },
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
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
  const [busca, setBusca] = useState("");
  const lista = useMemo(() => filtrarAmbientes(ambientes ?? [], busca), [ambientes, busca]);

  const entrar = (a: Ambiente) => {
    gravarAmbiente(a.id);
    navigate({ to: destinoDoAmbiente(a) as "/dashboard", replace: true });
  };

  useEffect(() => {
    if (!ambientes) return;
    if (ambientes.length === 0) { gravarAmbiente("empresa"); navigate({ to: "/dashboard", replace: true }); }
    else if (!precisaEscolher(ambientes)) entrar(ambientes[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambientes]);

  const sair = async () => { await supabase.auth.signOut(); navigate({ to: "/login", replace: true }); };
  const pronto = !isLoading && !!ambientes && precisaEscolher(ambientes);

  return (
    <div className="flex h-dvh items-center justify-center bg-muted/40">
      {!pronto && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando" />}
      <Dialog open={pronto} onOpenChange={(o) => { if (!o) void sair(); }}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Onde deseja entrar?</DialogTitle>
            <DialogDescription>Você tem mais de um acesso. Pode trocar depois pelo menu do seu nome, no topo.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar condomínio, torre, unidade ou empresa" className="pl-9" aria-label="Filtrar acessos" />
          </div>
          <div className="-mx-1 min-h-0 flex-1 space-y-2 overflow-y-auto px-1">
            {lista.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhum acesso encontrado.</p>}
            {lista.map((a) => {
              const Icone = a.tipo === "empresa" ? Building2 : Home;
              return (
                <button key={a.id} type="button" onClick={() => entrar(a)}
                  className="flex w-full items-center gap-4 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icone className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">{a.tipo === "empresa" ? "Gestão da empresa" : "Condomínio"}</span>
                    <span className="block truncate font-semibold text-foreground">{a.titulo}</span>
                    <span className="block truncate text-sm text-muted-foreground">{a.subtitulo}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => void sair()}>Sair</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
