import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, PenLine, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { sha256 } from "@/lib/propostas";
import { formatCpfCnpj } from "@/lib/input-masks";
import { CSS_FOLHA_DOC, htmlFolhaDocumento } from "@/lib/documentos";
import type { Row } from "@/lib/row";

export const Route = createFileRoute("/doc/$token")({
  staticData: { sitemap: false },
  ssr: false,
  head: () => ({
    meta: [
      { title: "Assinatura de documento — Atende.ai" },
      { name: "description", content: "Leia o documento e assine eletronicamente." },
      { property: "og:title", content: "Assinatura de documento — Atende.ai" },
      { property: "og:description", content: "Leia o documento e assine eletronicamente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DocumentoPublico,
});

type Dados = { encontrado: boolean; documento: Row; empresa: Row | null };

const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);

function DocumentoPublico() {
  const { token } = Route.useParams();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState("");
  const [doc, setDoc] = useState("");
  const [aceite, setAceite] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState("");

  const carregar = async () => {
    const { data, error } = await rpc("obter_documento_publico", { _token: token });
    if (error) return setErro(`Não foi possível abrir o documento. ${error.message}`);
    const d = data as Dados;
    if (!d?.encontrado) return setErro("Documento não encontrado ou link inválido.");
    setDados(d);
  };
  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (erro) return <div className="text-muted-foreground grid min-h-screen place-items-center p-6 text-center">{erro}</div>;
  if (!dados) return <div className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin" /></div>;

  const d = dados.documento;
  const assinado = !!d["assinado_em"];
  const n = doc.replace(/\D/g, "").length;
  const podeAssinar = nome.trim().split(/\s+/).length >= 2 && (n === 11 || n === 14) && aceite;

  const assinar = async () => {
    setEnviando(true);
    setMsg("");
    let ip = "indisponível";
    try {
      ip = ((await (await fetch("https://api.ipify.org?format=json")).json()) as { ip: string }).ip;
    } catch {
      /* segue sem IP */
    }
    const momento = new Date().toISOString();
    const hash = await sha256(JSON.stringify({ token, titulo: d["titulo"], conteudo: d["conteudo"], nome, doc, ip, momento }));
    const { data, error } = await rpc("assinar_documento_publico", {
      _token: token, _nome: nome, _documento: doc.replace(/\D/g, ""), _ip: ip, _user_agent: navigator.userAgent, _hash: hash,
    });
    setEnviando(false);
    const r = data as { sucesso?: boolean; mensagem?: string } | null;
    if (error || !r?.sucesso) return setMsg(r?.mensagem || error?.message || "Não foi possível assinar.");
    await carregar();
  };

  return (
    <div className="bg-muted/50 min-h-screen">
      <div className="bg-background/95 sticky top-0 z-20 border-b backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[860px] items-center justify-between gap-2 px-4 py-3">
          <span className="truncate text-sm font-semibold">{String(d["titulo"] ?? "Documento")}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-1 size-4" /> Baixar PDF</Button>
            {!assinado && (
              <Button size="sm" onClick={() => document.getElementById("assinar")?.scrollIntoView({ behavior: "smooth" })}>
                <PenLine className="mr-1 size-4" /> Assinar
              </Button>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[860px] space-y-6 px-3 py-6 md:py-10">
        <article className="rounded-xl border bg-white p-4 shadow-sm md:p-10 print:border-0 print:p-0 print:shadow-none">
          <style>{CSS_FOLHA_DOC}</style>
          <div dangerouslySetInnerHTML={{ __html: htmlFolhaDocumento(d, dados.empresa) }} />
        </article>

        {assinado ? (
          <section className="bg-card flex items-center gap-3 rounded-xl border p-6 shadow-sm print:hidden">
            <CheckCircle2 className="text-success size-6 shrink-0" />
            <p className="text-sm">Documento assinado eletronicamente. Você pode baixar uma cópia em PDF.</p>
          </section>
        ) : (
          <section id="assinar" className="bg-card space-y-4 rounded-xl border p-6 shadow-sm print:hidden">
            <h2 className="font-semibold">Assinar eletronicamente</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nome completo</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>CPF ou CNPJ</Label>
                <Input value={doc} inputMode="numeric" onChange={(e) => setDoc(formatCpfCnpj(e.target.value))} />
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={aceite} onCheckedChange={(c) => setAceite(c === true)} />
              Li o documento por completo e concordo com seu conteúdo.
            </label>
            {msg && <p className="text-destructive text-sm">{msg}</p>}
            <Button disabled={!podeAssinar || enviando} onClick={assinar}>
              {enviando ? <Loader2 className="mr-1 size-4 animate-spin" /> : <PenLine className="mr-1 size-4" />} Assinar documento
            </Button>
            <p className="text-muted-foreground text-xs">
              Registramos data/hora, IP, dispositivo e um código de autenticidade (hash) do documento.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
