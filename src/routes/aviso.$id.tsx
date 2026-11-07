import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Megaphone, Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { mensagemEmailHtml } from "@/lib/regua-cobranca";
import type { Row } from "@/lib/row";

export const Route = createFileRoute("/aviso/$id")({
  staticData: { sitemap: false },
  ssr: false,
  head: () => ({
    meta: [
      { title: "Comunicado do condomínio" },
      { name: "description", content: "Comunicado oficial enviado pela administração do seu condomínio." },
      { property: "og:title", content: "Comunicado do condomínio" },
      { property: "og:description", content: "Comunicado oficial enviado pela administração do seu condomínio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AvisoPublico,
});

const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);
const s = (v: unknown) => (v == null ? "" : String(v));

function AvisoPublico() {
  const { id } = Route.useParams();
  const [d, setD] = useState<Row | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    void rpc("cond_aviso_abrir_publico", { p_envio: id }).then(({ data, error }) => {
      const r = data as Row | null;
      if (error || !r?.["encontrado"]) setErro("Comunicado não encontrado ou link inválido.");
      else setD(r);
    });
  }, [id]);

  if (erro) return <main className="grid min-h-screen place-items-center bg-muted/30 p-6 text-muted-foreground">{erro}</main>;
  if (!d) return <main className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin text-primary" aria-label="Carregando" /></main>;
  const cancelado = s(d["status"]) === "cancelado";
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8">
      <article className="mx-auto max-w-2xl overflow-hidden rounded-xl border-t-4 border-primary bg-card shadow-sm">
        <header className="border-b p-6">
          <p className="text-sm text-muted-foreground">{s(d["condominio"])}</p>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold"><Megaphone className="size-5 text-primary" /> {s(d["titulo"])}</h1>
          <p className="mt-1 text-xs text-muted-foreground">Para {s(d["nome"])} · {s(d["unidades"])} · {new Date(s(d["enviado_em"])).toLocaleString("pt-BR")}</p>
        </header>
        {cancelado && <p className="border-b bg-destructive/10 px-6 py-3 text-sm text-destructive">Este aviso foi cancelado.{d["motivo_cancelamento"] ? ` Motivo: ${s(d["motivo_cancelamento"])}` : ""}</p>}
        <div className="prose prose-sm max-w-none p-6" dangerouslySetInnerHTML={{ __html: mensagemEmailHtml(s(d["mensagem"])) }} />
        {d["midia_url"] ? (
          <footer className="border-t p-6">
            {s(d["midia_tipo"]) === "imagem" ? <img src={s(d["midia_url"])} alt={s(d["midia_nome"]) || "Anexo do aviso"} className="max-w-full rounded-md" />
              : <a href={s(d["midia_url"])} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-medium text-primary underline"><Paperclip className="size-4" /> {s(d["midia_nome"]) || "Abrir anexo"}</a>}
          </footer>
        ) : null}
      </article>
      <p className="mt-4 text-center text-xs text-muted-foreground">Sua leitura foi confirmada para a administração.</p>
    </main>
  );
}
