import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { jitsiUrl } from "@/components/atendimentos/ChamadaFlutuante";

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
  useEffect(() => {
    setAudio(new URLSearchParams(window.location.search).get("audio") === "1");
  }, []);
  const valida = /^atendeai-[a-z0-9]+$/.test(sala);

  if (!valida) {
    return <main className="flex min-h-screen items-center justify-center p-6 text-muted-foreground">Link de chamada inválido.</main>;
  }
  if (entrou) {
    return (
      <iframe
        title="Chamada"
        src={jitsiUrl(sala, nome || "Cliente", !audio)}
        allow="camera; microphone; display-capture; fullscreen; autoplay"
        className="h-[100dvh] w-full border-0"
      />
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
