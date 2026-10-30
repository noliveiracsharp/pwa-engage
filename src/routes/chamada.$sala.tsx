import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SalaWebRTC } from "@/components/atendimentos/SalaWebRTC";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/chamada/$sala")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Chamada ao vivo — Atende.ai" },
      { name: "description", content: "Entre na chamada de áudio e vídeo com o atendimento, direto pelo navegador." },
      { property: "og:title", content: "Chamada ao vivo — Atende.ai" },
      { property: "og:description", content: "Toque para entrar na chamada com o atendimento, sem instalar nada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ChamadaPublica,
});

function ChamadaPublica() {
  const { sala } = Route.useParams();
  const [audio, setAudio] = useState(false);
  const [nome, setNome] = useState("");
  const [entrou, setEntrou] = useState(false);
  const [saiu, setSaiu] = useState(false);
  const { usuario } = useAuth();
  const [org, setOrg] = useState(false);
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    setAudio(qs.get("audio") === "1");
    const rid = qs.get("org");
    const uid = usuario?.["id"] ? String(usuario["id"]) : "";
    if (usuario?.["nome"]) setNome((n) => n || String(usuario["nome"]));
    if (!rid || !uid) return;
    void (supabase.from("reunioes" as never) as any).select("criado_por,sala").eq("id", rid).maybeSingle()
      .then(({ data }: { data: { criado_por: string; sala: string } | null }) => setOrg(!!data && data.sala === sala && String(data.criado_por) === uid));
  }, [usuario, sala]);
  const valida = /^atendeai-[a-z0-9]+$/.test(sala);

  if (!valida) {
    return <main className="flex min-h-screen items-center justify-center p-6 text-muted-foreground">Link de chamada inválido.</main>;
  }
  if (saiu && !entrou) {
    return <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center"><p className="text-lg font-medium text-foreground">Chamada encerrada</p><p className="text-sm text-muted-foreground">Obrigado! Você já pode fechar esta página.</p><Button variant="outline" onClick={() => { setSaiu(false); setEntrou(true); }}>Entrar novamente</Button></main>;
  }
  if (entrou) {
    return (
      <div className="h-[100dvh]"><SalaWebRTC sala={sala} nome={nome || "Cliente"} video={!audio} gravavel={org} onSair={() => { setEntrou(false); setSaiu(true); }} /></div>
    );
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6 text-center shadow-lg">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Video className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">Chamada {audio ? "de áudio" : "de vídeo"}</h1>
        <p className="text-sm text-muted-foreground">O atendente está aguardando você. Permita o uso do microfone{audio ? "" : " e da câmera"} quando o navegador pedir.</p>
        <Input placeholder="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        <Button className="w-full" onClick={() => setEntrou(true)}>Entrar na chamada</Button>
      </div>
    </main>
  );
}
