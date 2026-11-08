import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FileText, Home, Loader2, Megaphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { lerAmbiente, useAmbientes } from "@/hooks/useAmbientes";
import { rotuloPapel } from "@/lib/ambientes";
import { htmlParaTexto } from "@/lib/html-texto";

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

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const dataBR = (v: unknown) => (v ? new Date(s(v)).toLocaleDateString("pt-BR") : "");

function MinhaUnidade() {
  const { data: ambientes, isLoading } = useAmbientes();
  const unidades = (ambientes ?? []).filter((a) => a.tipo === "unidade");
  const atual = unidades.find((a) => a.id === lerAmbiente()) ?? unidades[0];
  const v = atual && atual.tipo === "unidade" ? atual.vinculo : null;
  const condId = v?.condominio_id ?? "";

  const avisos = useQuery({
    queryKey: ["portal", "avisos", condId],
    enabled: !!condId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("cond_avisos").select("*").eq("condominio_id", condId).order("created_at", { ascending: false }).limit(100);
      const agora = Date.now();
      return ((data ?? []) as Row[]).filter((a) => ["enviado", "enviando"].includes(s(a["status"])) && !a["arquivado_em"] && (!a["expira_em"] || new Date(s(a["expira_em"])).getTime() > agora));
    },
  });
  const docs = useQuery({
    queryKey: ["portal", "docs", condId, v?.papel],
    enabled: !!condId,
    queryFn: async () => {
      const { data } = await (supabase as any).from("cond_documentos").select("*").eq("condominio_id", condId).order("created_at", { ascending: false });
      const vis = v?.papel === "proprietario" ? ["moradores", "proprietarios"] : ["moradores"];
      return ((data ?? []) as Row[]).filter((d) => vis.includes(s(d["visibilidade"])));
    },
  });
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const abrirDoc = async (d: Row) => {
    setAbrindo(s(d["id"]));
    const { data } = await supabase.storage.from("cond-documentos").createSignedUrl(s(d["arquivo_path"]), 3600);
    setAbrindo(null);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  };

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando" /></div>;
  if (!v) return <div className="py-12 text-center text-muted-foreground">Você não tem unidade vinculada. <Link to="/acesso" className="text-primary underline">Voltar</Link></div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Condomínio</p>
          <h1 className="text-2xl font-bold text-foreground">{v.condominio_nome}</h1>
        </div>
        {(ambientes?.length ?? 0) > 1 && <Button variant="outline" asChild><Link to="/acesso">Trocar acesso</Link></Button>}
      </div>
      <Tabs defaultValue="unidade">
        <TabsList>
          <TabsTrigger value="unidade"><Home className="mr-1.5 h-4 w-4" /> Minha unidade</TabsTrigger>
          <TabsTrigger value="avisos"><Megaphone className="mr-1.5 h-4 w-4" /> Avisos</TabsTrigger>
          <TabsTrigger value="docs"><FileText className="mr-1.5 h-4 w-4" /> Documentos</TabsTrigger>
        </TabsList>
        <TabsContent value="unidade">
          <Card>
            <CardHeader><CardTitle className="text-base">Dados da unidade</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2 text-sm">
              {v.bloco && <span className="font-medium">{v.bloco}</span>}
              <span className="font-medium">Unidade {v.numero}</span>
              <Badge variant="secondary">{rotuloPapel(v.papel)}</Badge>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="avisos" className="space-y-2">
          {avisos.isLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : (avisos.data ?? []).length === 0
            ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum aviso ativo.</p>
            : avisos.data!.map((a) => (
              <Card key={s(a["id"])}><CardContent className="space-y-1 p-4">
                <div className="flex items-center justify-between gap-2"><p className="font-medium">{s(a["titulo"])}</p><span className="text-xs text-muted-foreground">{dataBR(a["created_at"])}</span></div>
                <p className="line-clamp-3 text-sm text-muted-foreground">{htmlParaTexto(s(a["mensagem"]))}</p>
              </CardContent></Card>
            ))}
        </TabsContent>
        <TabsContent value="docs" className="space-y-2">
          {docs.isLoading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : (docs.data ?? []).length === 0
            ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum documento disponível.</p>
            : docs.data!.map((d) => (
              <Card key={s(d["id"])}><CardContent className="flex items-center justify-between gap-2 p-4">
                <div className="min-w-0"><p className="truncate font-medium">{s(d["titulo"])}</p><p className="text-xs text-muted-foreground">{dataBR(d["data_documento"] || d["created_at"])}</p></div>
                <Button size="sm" variant="outline" disabled={abrindo === s(d["id"])} onClick={() => void abrirDoc(d)}>Abrir</Button>
              </CardContent></Card>
            ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
