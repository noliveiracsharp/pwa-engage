import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, CalendarCheck, CalendarPlus, ChevronLeft, ChevronRight, Clock, Globe, Loader2, MapPin, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { horariosLivres, linkGoogleAgenda, type ConfigAgendamento, type Ocupado } from "@/lib/agendamento";

export const Route = createFileRoute("/agendar/$slug")({
  staticData: { sitemap: false },
  ssr: false,
  head: () => ({
    meta: [
      { title: "Agende um horário — Atende.ai" },
      { name: "description", content: "Escolha o melhor dia e horário e confirme sua reunião em poucos cliques." },
      { property: "og:title", content: "Agende um horário — Atende.ai" },
      { property: "og:description", content: "Escolha o melhor dia e horário e confirme sua reunião em poucos cliques." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AgendarPublico,
});

type Dados = { encontrado: boolean; nome: string; foto: string; cargo: string; empresa: string; logo: string; config: ConfigAgendamento; ocupados: Ocupado[] };
const rpc = (fn: string, a: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, x: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, a);
const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const isoBR = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const horaBR = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

function AgendarPublico() {
  const { slug } = Route.useParams();
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [mes, setMes] = useState(() => { const h = new Date(); return new Date(h.getFullYear(), h.getMonth(), 1); });
  const [dia, setDia] = useState<string | null>(null);
  const [hora, setHora] = useState<Date | null>(null);
  const [f, setF] = useState({ nome: "", email: "", telefone: "", assunto: "" });
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<{ sala: string } | null>(null);

  const carregar = async () => {
    const { data, error } = await rpc("agenda_publica", { p_slug: slug });
    if (error) return setErro("Não foi possível abrir esta agenda agora.");
    setD(data as Dados);
  };
  useEffect(() => { void carregar(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const diasMes = useMemo(() => {
    const primeiro = new Date(mes); const off = primeiro.getDay();
    const total = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    return [...Array(off).fill(null), ...Array.from({ length: total }, (_, i) => isoBR(new Date(mes.getFullYear(), mes.getMonth(), i + 1, 12)))] as (string | null)[];
  }, [mes]);
  const livres = (iso: string) => (d?.config ? horariosLivres(d.config, iso, d.ocupados ?? []) : []);
  const slots = dia ? livres(dia) : [];

  const confirmar = async () => {
    if (!hora) return;
    if (!f.nome.trim() || !/^\S+@\S+\.\S+$/.test(f.email.trim())) return setErro("Informe seu nome e um e-mail válido.");
    setEnviando(true); setErro("");
    const { data, error } = await rpc("agendar_publico", { p_slug: slug, p_inicio: hora.toISOString(), p_nome: f.nome, p_email: f.email, p_telefone: f.telefone, p_assunto: f.assunto });
    setEnviando(false);
    if (error) { setErro(error.message); setHora(null); void carregar(); return; }
    setFeito({ sala: String((data as { sala?: string })?.sala ?? "") });
  };

  if (!d && !erro) return <div className="flex min-h-screen items-center justify-center bg-muted/40"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (d && (!d.encontrado)) return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6 text-center">
      <div className="max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm"><CalendarCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><h1 className="text-lg font-semibold">Agenda fechada</h1><p className="mt-1 text-sm text-muted-foreground">Este link de agendamento não está disponível no momento.</p></div>
    </div>
  );
  const c = d?.config;
  const online = c?.modalidade !== "presencial";
  const linkSala = feito?.sala ? `${window.location.origin}/chamada/${feito.sala}` : "";

  return (
    <div className="min-h-screen bg-muted/40 px-4 py-8 md:py-14">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-lg md:grid-cols-[320px_1fr]">
        <aside className="border-b border-border p-6 md:border-b-0 md:border-r">
          {d?.logo && <img src={d.logo} alt={d.empresa} className="mb-6 h-8 max-w-[160px] object-contain" />}
          <Avatar className="h-20 w-20 ring-4 ring-primary/15">
            <AvatarImage src={d?.foto || undefined} alt={d?.nome} className="object-cover" />
            <AvatarFallback className="bg-primary text-xl text-primary-foreground">{iniciais(d?.nome ?? "")}</AvatarFallback>
          </Avatar>
          <p className="mt-4 text-sm text-muted-foreground">{d?.nome}{d?.cargo ? ` · ${d.cargo}` : ""}</p>
          {d?.empresa && <p className="text-xs text-muted-foreground">{d.empresa}</p>}
          <h1 className="mt-2 text-2xl font-bold leading-tight">{c?.titulo}</h1>
          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2"><Clock className="h-4 w-4" /> {c?.duracao_min} minutos</li>
            <li className="flex items-center gap-2">{online ? <><Video className="h-4 w-4" /> Vídeo chamada (sem instalar nada)</> : <><MapPin className="h-4 w-4" /> {c?.local || "Presencial"}</>}</li>
            <li className="flex items-center gap-2"><Globe className="h-4 w-4" /> Horário de Brasília</li>
            {hora && <li className="flex items-center gap-2 font-medium text-primary"><CalendarCheck className="h-4 w-4" /> {hora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" })}, {horaBR(hora)}</li>}
          </ul>
          {c?.descricao && <p className="mt-5 whitespace-pre-line text-sm">{c.descricao}</p>}
        </aside>

        <main className="p-6">
          {feito ? (
            <div className="flex h-full flex-col items-center justify-center py-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/15"><CalendarCheck className="h-7 w-7 text-success" /></div>
              <h2 className="text-xl font-semibold">Reunião confirmada!</h2>
              <p className="mt-1 text-sm text-muted-foreground">{hora?.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" })} às {hora && horaBR(hora)} com {d?.nome}.</p>
              {online && linkSala && <p className="mt-4 text-sm">Link da sala: <a href={linkSala} target="_blank" rel="noreferrer" className="break-all text-primary underline">{linkSala}</a></p>}
              <Button className="mt-6" variant="outline" onClick={() => hora && window.open(linkGoogleAgenda(`${c?.titulo} — ${d?.nome}`, hora, c?.duracao_min ?? 30, online ? `Entre pelo link: ${linkSala}` : (c?.local ?? ""), online ? linkSala : c?.local ?? ""), "_blank")}>
                <CalendarPlus className="mr-2 h-4 w-4" /> Adicionar ao Google Agenda
              </Button>
            </div>
          ) : hora ? (
            <div className="mx-auto max-w-md">
              <button type="button" onClick={() => setHora(null)} className="mb-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="h-4 w-4" /> Voltar</button>
              <h2 className="mb-4 text-lg font-semibold">Seus dados</h2>
              <div className="space-y-3">
                <div className="space-y-1.5"><Label htmlFor="ag-nome">Nome *</Label><Input id="ag-nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="ag-email">E-mail *</Label><Input id="ag-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="ag-tel">WhatsApp</Label><Input id="ag-tel" inputMode="tel" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="ag-ass">Sobre o que gostaria de conversar?</Label><Textarea id="ag-ass" rows={3} value={f.assunto} onChange={(e) => setF({ ...f, assunto: e.target.value })} /></div>
                {erro && <p className="text-sm text-destructive">{erro}</p>}
                <Button className="w-full" disabled={enviando} onClick={() => void confirmar()}>{enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar agendamento</Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_200px]">
              <div>
                <h2 className="mb-4 text-lg font-semibold">Escolha a data e o horário</h2>
                {erro && <p className="mb-3 text-sm text-destructive">{erro}</p>}
                <div className="mb-3 flex items-center justify-between">
                  <Button size="icon" variant="ghost" aria-label="Mês anterior" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="font-medium capitalize">{mes.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</span>
                  <Button size="icon" variant="ghost" aria-label="Próximo mês" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {SEMANA.map((s, i) => <span key={i} className="py-1 text-xs font-medium text-muted-foreground">{s}</span>)}
                  {diasMes.map((iso, i) => {
                    if (!iso) return <span key={i} />;
                    const tem = livres(iso).length > 0;
                    return (
                      <button key={iso} type="button" disabled={!tem} onClick={() => setDia(iso)} aria-label={iso}
                        className={cn("mx-auto flex h-11 w-11 items-center justify-center rounded-full text-sm transition-colors",
                          tem ? "bg-primary/10 font-semibold text-primary hover:bg-primary/20" : "cursor-default text-muted-foreground/50",
                          dia === iso && "bg-primary text-primary-foreground hover:bg-primary")}>
                        {Number(iso.slice(8, 10))}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                {dia ? (<>
                  <p className="mb-3 text-sm font-medium capitalize">{new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" })}</p>
                  <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                    {slots.map((s) => <Button key={s.toISOString()} variant="outline" className="w-full border-primary/40 font-semibold text-primary hover:bg-primary/10" onClick={() => { setErro(""); setHora(s); }}>{horaBR(s)}</Button>)}
                  </div>
                </>) : <p className="text-sm text-muted-foreground lg:pt-12">Escolha um dia destacado para ver os horários.</p>}
              </div>
            </div>
          )}
        </main>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">Agendamento por Atende.ai</p>
    </div>
  );
}
