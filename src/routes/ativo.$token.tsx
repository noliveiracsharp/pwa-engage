import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ExternalLink, Loader2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { STATUS, TIPOS, linkOs, meta } from "@/lib/manutencoes";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ativo/$token")({
  staticData: { sitemap: false },
  ssr: false,
  head: () => ({
    meta: [
      { title: "Ficha do equipamento — Atende.ai" },
      { name: "description", content: "Ficha técnica, histórico de manutenções e abertura de chamado do equipamento." },
      { property: "og:title", content: "Ficha do equipamento — Atende.ai" },
      { property: "og:description", content: "Histórico de manutenções e abertura de chamado pelo QR Code." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AtivoPublico,
});

type R = Record<string, unknown>;
type Dados = { encontrado: boolean; ativo: R; empresa: R | null; cliente: R | null; historico: R[] };
const rpc = (fn: string, args: R) =>
  (supabase.rpc as unknown as (f: string, a: R) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);
const s = (v: unknown) => (v == null ? "" : String(v));
const dia = (v: unknown) => (v ? new Date(`${s(v).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "");

function AtivoPublico() {
  const { token } = Route.useParams();
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [form, setForm] = useState({ nome: "", telefone: "", descricao: "" });
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState("");
  const [msg, setMsg] = useState("");

  const carregar = async () => {
    const { data, error } = await rpc("obter_ativo_publico", { _token: token });
    if (error) return setErro("Não foi possível abrir a ficha do equipamento.");
    const r = data as Dados;
    if (!r?.encontrado) return setErro("Equipamento não encontrado ou QR Code inválido.");
    setD(r);
  };
  useEffect(() => { void carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  const abrirChamado = async () => {
    setEnviando(true); setMsg("");
    const { data, error } = await rpc("abrir_chamado_ativo", { _token: token, _nome: form.nome, _telefone: form.telefone, _descricao: form.descricao });
    setEnviando(false);
    const r = (data ?? {}) as R;
    if (error || !r["sucesso"]) return setMsg(s(r["mensagem"]) || "Não foi possível abrir o chamado.");
    setOk(s(r["numero"])); void carregar();
  };

  if (erro) return <div className="grid min-h-screen place-items-center p-6 text-center text-muted-foreground">{erro}</div>;
  if (!d) return <div className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  const a = d.ativo;
  const linhas = [["Marca", a["marca"]], ["Modelo", a["modelo"]], ["Nº de série", a["numero_serie"]], ["Local", a["local"]], ["Instalado em", dia(a["instalado_em"])], ["Garantia até", dia(a["garantia_ate"])]].filter(([, v]) => s(v));

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-6">
      <div className="mx-auto max-w-xl space-y-4">
        <header className="flex items-center gap-3">
          {d.empresa?.["logo"] ? <img data-no-zoom src={s(d.empresa["logo"])} alt="" className="h-10 max-w-32 object-contain" /> : <Wrench className="h-8 w-8 text-primary" />}
          <div className="text-sm text-muted-foreground">{s(d.empresa?.["nome"])}</div>
        </header>
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div>
            <h1 className="text-xl font-bold">{s(a["nome"])}</h1>
            <p className="text-sm text-muted-foreground">{[s(d.cliente?.["nome"]), s(a["categoria"])].filter(Boolean).join(" · ")}</p>
          </div>
          {linhas.length > 0 && <dl className="grid grid-cols-2 gap-2 text-sm">{linhas.map(([k, v]) => <div key={s(k)}><dt className="text-xs text-muted-foreground">{s(k)}</dt><dd className="font-medium">{s(v)}</dd></div>)}</dl>}
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Abrir chamado para este equipamento</h2>
          {ok ? (
            <div className="flex items-start gap-2 rounded-lg bg-success/10 p-3 text-sm text-success"><CheckCircle2 className="mt-0.5 h-4 w-4" /> Chamado <b>{ok}</b> aberto. A equipe técnica vai entrar em contato.</div>
          ) : (
            <>
              <div className="space-y-1.5"><Label>Seu nome *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Telefone / WhatsApp</Label><Input inputMode="tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>O que está acontecendo? *</Label><Textarea rows={3} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
              {msg && <p className="text-sm text-destructive">{msg}</p>}
              <Button className="w-full" onClick={abrirChamado} disabled={enviando}>{enviando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Abrir chamado</Button>
            </>
          )}
        </section>

        <section className="space-y-2 rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Histórico de manutenções</h2>
          {d.historico.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma manutenção registrada ainda.</p> : d.historico.map((h, i) => (
            <div key={i} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm last:border-0">
              <div><span className="font-semibold">{s(h["numero"])}</span> <span className={cn("ml-1 rounded-full px-2 py-0.5 text-xs", meta(TIPOS, h["tipo"]).cls)}>{meta(TIPOS, h["tipo"]).label}</span>
                <div className="text-xs text-muted-foreground">{dia(h["data"])} · {meta(STATUS, h["status"]).label}</div></div>
              {h["status"] === "concluida" && h["token"] ? <a className="inline-flex items-center gap-1 text-xs text-primary underline" href={linkOs(h["token"])} target="_blank" rel="noreferrer">Relatório <ExternalLink className="h-3 w-3" /></a> : null}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
