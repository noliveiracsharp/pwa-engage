import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { Bell, Brain, Clock, Filter, Loader2, MessageSquarePlus, Plus, Printer, RotateCcw, Search, Settings2, Sparkles, Star, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { useEmpresaAtiva } from "@/hooks/useEmpresaAtiva";
import { imprimirElemento } from "@/lib/propostas";
import { htmlParaTexto } from "@/lib/html-texto";
import {
  DIAS_SEMANA, SLA_META, STATUS_ATEND, formatarDuracao, indiceReputacao, minutosUteis, normalizarHorarios, numeroTicket, situacaoSla, statusAtend,
  type Horarios, type SituacaoSla,
} from "@/lib/cond-atendimentos";
import { analisarReputacaoIA, type AnaliseReputacao } from "@/lib/cond-atendimentos.functions";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { CampoData } from "./CampoData";
import { s } from "./cond-data";
import { AtendimentoSheet, NovoAtendimentoSheet, type CtxAtend } from "./AtendimentoChat";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Perms = { canRead: boolean; canCreate: boolean; canUpdate: boolean; canDelete: boolean };
const dia = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString("pt-BR") : "—");
const dh = (v: unknown) => (v ? new Date(String(v)).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const alfa = <T extends { label: string }>(l: T[]) => [...l].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

export function StatusBadge({ status, morador }: { status: unknown; morador?: boolean }) {
  const m = statusAtend(status);
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", m.cor)}>{morador ? m.morador : m.label}</span>;
}
export function SlaBadge({ sit }: { sit: SituacaoSla }) {
  const m = SLA_META[sit];
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", m.cor)}><Clock className="size-3" aria-hidden />{m.label}</span>;
}

export function AtendimentosPanel({ condominioId, nomeCondominio, blocos, unidades, perms }: { condominioId: string; nomeCondominio: string; blocos: Row[]; unidades: Row[]; perms: Perms }) {
  const gestao = perms.canUpdate;
  const qc = useQueryClient();
  const [me, setMe] = useState("");
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? "")); }, []);

  const chave = ["cond", "atendimentos", condominioId];
  const { data: atendimentos = [], isLoading } = useQuery({
    queryKey: chave, enabled: !!condominioId,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await db.from("cond_atendimentos").select("*").eq("condominio_id", condominioId).order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const { data: assuntos = [] } = useQuery({
    queryKey: ["cond", "atend-assuntos", condominioId], enabled: !!condominioId,
    queryFn: async (): Promise<Row[]> => ((await db.from("cond_atend_assuntos").select("*").eq("condominio_id", condominioId)).data ?? []) as Row[],
  });
  const { data: config } = useQuery({
    queryKey: ["cond", "atend-config", condominioId], enabled: !!condominioId,
    queryFn: async (): Promise<Row | null> => ((await db.from("cond_atend_config").select("*").eq("condominio_id", condominioId).maybeSingle()).data ?? null) as Row | null,
  });
  const horarios = normalizarHorarios(config?.["horarios"]);
  const { data: espacos = [] } = useQuery({
    queryKey: ["cond", "cond_espacos", "condominio_id", condominioId], enabled: !!condominioId,
    queryFn: async (): Promise<Row[]> => ((await db.from("cond_espacos").select("id,nome").eq("condominio_id", condominioId)).data ?? []) as Row[],
  });
  const { data: mencionaveis = [] } = useQuery({
    queryKey: ["cond", "atend-mencionaveis", condominioId], enabled: !!condominioId,
    queryFn: async (): Promise<Row[]> => ((await db.rpc("cond_atend_mencionaveis", { p_cond: condominioId })).data ?? []) as Row[],
  });
  const { data: moradores = [] } = useQuery({
    queryKey: ["cond", "atend-moradores", condominioId], enabled: !!condominioId && gestao,
    queryFn: async (): Promise<Row[]> => ((await db.rpc("cond_atend_moradores", { p_cond: condominioId })).data ?? []) as Row[],
  });
  const idsPessoas = useMemo(() => [...new Set(atendimentos.flatMap((a) => [s(a["aberto_por"]), s(a["aberto_para"])]).filter(Boolean))].sort(), [atendimentos]);
  const { data: pessoas = [] } = useQuery({
    queryKey: ["cond", "atend-pessoas", idsPessoas.join(",")], enabled: idsPessoas.length > 0,
    queryFn: async (): Promise<Row[]> => ((await db.rpc("cond_atend_pessoas", { p_ids: idsPessoas })).data ?? []) as Row[],
  });
  const nomePessoa = (id: unknown) => s(pessoas.find((p) => s(p["id"]) === s(id))?.["nome"]) || (s(id) === me ? "Você" : "Administração");

  // Tempo real + notificação do navegador para cada nova interação de outra pessoa.
  useEffect(() => {
    if (!condominioId) return;
    const ch = supabase.channel(`atend-${condominioId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cond_atendimentos", filter: `condominio_id=eq.${condominioId}` }, () => qc.invalidateQueries({ queryKey: ["cond", "atendimentos", condominioId] }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "cond_atend_mensagens" }, (p) => {
        const m = p.new as Row;
        qc.invalidateQueries({ queryKey: ["cond", "atend-msgs", s(m["atendimento_id"])] });
        qc.invalidateQueries({ queryKey: ["cond", "atendimentos", condominioId] });
        if (s(m["autor_id"]) !== me && typeof Notification !== "undefined" && Notification.permission === "granted") {
          try { new Notification("Nova interação no atendimento", { body: htmlParaTexto(s(m["texto"])).slice(0, 140), icon: "/icon-192.png" }); } catch { /* sem suporte */ }
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [condominioId, me, qc]);

  const [aba, setAba] = useState(gestao ? "painel" : "lista");
  const [aberto, setAberto] = useState<string | null>(null);
  const [novo, setNovo] = useState<Partial<Row> | null>(null);
  const [filtroPainel, setFiltroPainel] = useState<{ status: string; sla: SituacaoSla } | null>(null);

  const ctx: CtxAtend = {
    condominioId, nomeCondominio, gestao, me, atendimentos, assuntos, horarios, espacos, mencionaveis, moradores, nomePessoa, blocos, unidades,
    recarregar: () => qc.invalidateQueries({ queryKey: ["cond", "atendimentos", condominioId] }),
    abrir: setAberto, novo: (base) => setNovo(base ?? {}),
  };
  const atual = atendimentos.find((a) => s(a["id"]) === aberto) ?? null;

  const pedirPush = async () => {
    if (typeof Notification === "undefined") { toast.error("Este navegador não suporta notificações."); return; }
    const r = await Notification.requestPermission();
    if (r === "granted") toast.success("Notificações ativadas neste aparelho."); else toast.warning("Notificações bloqueadas no navegador.");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{gestao ? "Atendimentos sigilosos entre moradores e a gestão: só os envolvidos veem a conversa." : "Fale com a administração. Somente você e a gestão veem a conversa."}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={pedirPush}><Bell className="size-4" /> Ativar notificações</Button>
          {perms.canCreate || !gestao ? <Button onClick={() => setNovo({})}><MessageSquarePlus className="size-4" /> {gestao ? "Novo atendimento" : "Abrir atendimento"}</Button> : null}
        </div>
      </div>
      <Tabs value={aba} onValueChange={setAba} className="space-y-4">
        <TabsList className="h-auto flex-wrap">
          {gestao && <TabsTrigger value="painel">Painel</TabsTrigger>}
          <TabsTrigger value="lista">{gestao ? "Atendimentos" : "Meus atendimentos"}</TabsTrigger>
          {gestao && <TabsTrigger value="equipe">Desempenho & Reputação</TabsTrigger>}
          {gestao && <TabsTrigger value="assuntos">Assuntos & SLA</TabsTrigger>}
          {gestao && <TabsTrigger value="horario">Horário de atendimento</TabsTrigger>}
        </TabsList>
        {gestao && <TabsContent value="painel"><Painel atendimentos={atendimentos} onFiltro={(f) => { setFiltroPainel(f); setAba("lista"); }} /></TabsContent>}
        <TabsContent value="lista">
          {isLoading ? <p className="text-sm text-muted-foreground"><Loader2 className="mr-1 inline size-4 animate-spin" />Carregando…</p>
            : <Lista ctx={ctx} filtroPainel={filtroPainel} limparPainel={() => setFiltroPainel(null)} />}
        </TabsContent>
        {gestao && <TabsContent value="equipe"><Desempenho ctx={ctx} /></TabsContent>}
        {gestao && <TabsContent value="assuntos"><Assuntos condominioId={condominioId} assuntos={assuntos} canEdit={perms.canUpdate} /></TabsContent>}
        {gestao && <TabsContent value="horario"><Horario condominioId={condominioId} horarios={horarios} canEdit={perms.canUpdate} /></TabsContent>}
      </Tabs>
      {atual && <AtendimentoSheet ctx={ctx} atendimento={atual} onClose={() => setAberto(null)} />}
      {novo && <NovoAtendimentoSheet ctx={ctx} base={novo} onClose={() => setNovo(null)} />}
    </div>
  );
}

/* ------------------------------- Painel (SLA) ------------------------------- */

function Painel({ atendimentos, onFiltro }: { atendimentos: Row[]; onFiltro: (f: { status: string; sla: SituacaoSla }) => void }) {
  const grupos = [
    { status: "pendente_resposta", nome: "Pendentes" },
    { status: "em_manutencao", nome: "Em manutenção" },
    { status: "em_analise", nome: "Em análise" },
    { status: "ocorrencias", nome: "Ocorrências" },
  ];
  const agora = new Date();
  const conta = (st: string, fora: boolean) => atendimentos.filter((a) => a["status"] === st && (situacaoSla(a as never, agora) === "fora") === fora).length;
  const porStatus = STATUS_ATEND.map((x) => ({ nome: x.label, total: atendimentos.filter((a) => a["status"] === x.value).length }));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {grupos.map((g) => [true, false].map((fora) => (
          <button key={g.status + fora} type="button" onClick={() => onFiltro({ status: g.status, sla: fora ? "fora" : "dentro" })}
            className={cn("rounded-lg border p-5 text-center transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              fora ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200")}>
            <div className="text-4xl font-semibold tabular-nums">{conta(g.status, fora)}</div>
            <div className="mt-1 text-sm">{g.nome} {fora ? "fora do prazo" : "dentro do prazo"}</div>
          </button>
        )))}
      </div>
      <div className="rounded-lg border p-4">
        <h3 className="mb-2 text-sm font-semibold">Atendimentos por status</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={porStatus}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="nome" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} /><RTooltip />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>{porStatus.map((_, i) => <Cell key={i} fill={["#f59e0b", "#0ea5e9", "#8b5cf6", "#f43f5e", "#f97316", "#10b981"][i]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Lista + filtros ------------------------------- */

function Lista({ ctx, filtroPainel, limparPainel }: { ctx: CtxAtend; filtroPainel: { status: string; sla: SituacaoSla } | null; limparPainel: () => void }) {
  const { gestao, atendimentos, assuntos, nomePessoa, mencionaveis, moradores, blocos, unidades } = ctx;
  const vazio = { status: "todos", assunto: "", ticket: "", abertoPor: "", mencionado: "", torre: "", de: "", ate: "", tipoData: "abertura", texto: "", sla: { dentro: true, proximo: true, fora: true } as Record<string, boolean>, ordem: "recentes" };
  const [f, setF] = useState(vazio);
  useEffect(() => { if (filtroPainel) setF({ ...vazio, status: filtroPainel.status, sla: { dentro: filtroPainel.sla !== "fora", proximo: filtroPainel.sla !== "fora", fora: filtroPainel.sla === "fora" } }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroPainel]);
  const [mostrar, setMostrar] = useState(gestao);
  const agora = new Date();
  const unidadeBloco = (uid: string) => s(unidades.find((u) => s(u["id"]) === uid)?.["cond_bloco_id"]);

  const lista = atendimentos.filter((a) => {
    if (f.status !== "todos" && a["status"] !== f.status) return false;
    const d = s(f.tipoData === "ocorrencia" ? a["data_ocorrencia"] : a["created_at"]).slice(0, 10);
    if (f.de && (!d || d < f.de)) return false;
    if (f.ate && (!d || d > f.ate)) return false;
    if (f.texto) { const q = f.texto.toLowerCase(); if (!`${s(a["titulo"])} ${htmlParaTexto(s(a["texto"]))} ${s(a["local"])}`.toLowerCase().includes(q)) return false; }
    if (!gestao) return true;
    if (f.assunto && s(a["assunto_id"]) !== f.assunto) return false;
    if (f.ticket && !String(a["numero"]).includes(f.ticket.replace(/\D/g, ""))) return false;
    if (f.abertoPor && s(a["aberto_para"]) !== f.abertoPor && s(a["aberto_por"]) !== f.abertoPor) return false;
    if (f.mencionado && !((a["mencionados"] as Row[]) ?? []).some((m) => s(m["id"]) === f.mencionado)) return false;
    if (f.torre && unidadeBloco(s(a["unidade_id"])) !== f.torre) return false;
    const sit = situacaoSla(a as never, agora);
    if (sit !== "encerrado" && !f.sla[sit]) return false;
    return true;
  }).sort((a, b) => (f.ordem === "recentes" ? -1 : 1) * s(a["created_at"]).localeCompare(s(b["created_at"])));

  const opStatus = [{ value: "todos", label: "— Todos —" }, ...STATUS_ATEND.map((x) => ({ value: x.value, label: gestao ? x.label : x.morador }))];
  return (
    <div className="space-y-3">
      <div className="rounded-lg border">
        <button type="button" className="flex w-full items-center justify-between p-3 text-left text-sm font-semibold" onClick={() => setMostrar((v) => !v)} aria-expanded={mostrar}>
          <span className="inline-flex items-center gap-2"><Filter className="size-4" /> Filtrar atendimentos</span><span className="text-xs text-muted-foreground">{lista.length} resultado(s)</span>
        </button>
        {mostrar && (
          <div className="grid gap-3 border-t p-3 md:grid-cols-2">
            <Campo label="Status"><SearchSelect value={f.status} onChange={(v) => setF({ ...f, status: v || "todos" })} options={opStatus} /></Campo>
            {gestao && <Campo label="Assunto"><SearchSelect value={f.assunto} allowClear placeholder="— Todos —" onChange={(v) => setF({ ...f, assunto: v })} options={alfa(assuntos.map((x) => ({ value: s(x["id"]), label: s(x["nome"]) })))} /></Campo>}
            {gestao && <Campo label="Nº do ticket"><Input inputMode="numeric" value={f.ticket} onChange={(e) => setF({ ...f, ticket: e.target.value })} placeholder="#000000" /></Campo>}
            {gestao && <Campo label="Aberto por / para"><SearchSelect value={f.abertoPor} allowClear placeholder="— Todos —" onChange={(v) => setF({ ...f, abertoPor: v })} options={alfa(moradores.map((m) => ({ value: s(m["usuario_id"]), label: `${s(m["nome"])} — ${s(m["rotulo"])}` })))} /></Campo>}
            {gestao && <Campo label="Mencionado"><SearchSelect value={f.mencionado} allowClear placeholder="— Todos —" onChange={(v) => setF({ ...f, mencionado: v })} options={alfa(mencionaveis.map((m) => ({ value: s(m["id"]), label: s(m["rotulo"]) })))} /></Campo>}
            {gestao && <Campo label="Torre / bloco"><SearchSelect value={f.torre} allowClear placeholder="— Todos —" onChange={(v) => setF({ ...f, torre: v })} options={alfa(blocos.map((b) => ({ value: s(b["id"]), label: s(b["nome"] ?? b["descricao"]) })))} /></Campo>}
            <div className="space-y-1.5">
              <Label>Período</Label>
              <div className="grid grid-cols-2 gap-2"><CampoData value={f.de} onChange={(v) => setF({ ...f, de: v })} inicio={2020} /><CampoData value={f.ate} onChange={(v) => setF({ ...f, ate: v })} inicio={2020} /></div>
              <div className="flex gap-4 text-sm">
                {[["abertura", "Data de abertura"], ["ocorrencia", "Data da ocorrência"]].map(([v, l]) => (
                  <label key={v} className="inline-flex items-center gap-1.5"><input type="radio" name="tipoData" checked={f.tipoData === v} onChange={() => setF({ ...f, tipoData: v! })} />{l}</label>
                ))}
              </div>
            </div>
            <Campo label="Texto"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input className="pl-9" value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} placeholder="Título, mensagem ou local" /></div></Campo>
            {gestao && (
              <div className="space-y-1.5"><Label>SLA</Label>
                <div className="flex flex-wrap gap-4 text-sm">{(["dentro", "proximo", "fora"] as const).map((k) => (
                  <label key={k} className="inline-flex items-center gap-1.5"><Checkbox checked={f.sla[k]} onCheckedChange={(c) => setF({ ...f, sla: { ...f.sla, [k]: !!c } })} />{SLA_META[k].label}</label>
                ))}</div>
              </div>
            )}
            <div className="space-y-1.5"><Label>Classificar por</Label>
              <div className="flex gap-4 text-sm">{[["recentes", "Recentes"], ["antigos", "Antigos"]].map(([v, l]) => (
                <label key={v} className="inline-flex items-center gap-1.5"><input type="radio" name="ordem" checked={f.ordem === v} onChange={() => setF({ ...f, ordem: v! })} />{l}</label>
              ))}</div>
            </div>
            <div className="flex items-end md:col-span-2"><Button variant="outline" onClick={() => { setF(vazio); limparPainel(); }}><RotateCcw className="size-4" /> Limpar filtros</Button></div>
          </div>
        )}
      </div>

      {!lista.length ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum atendimento encontrado.</p> : (
        <ul className="divide-y rounded-lg border">
          {lista.map((a) => {
            const as = assuntos.find((x) => s(x["id"]) === s(a["assunto_id"]));
            const sit = situacaoSla(a as never, agora);
            return (
              <li key={s(a["id"])}>
                <button type="button" onClick={() => ctx.abrir(s(a["id"]))} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-3 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
                  <span className="font-mono text-sm font-semibold">{numeroTicket(a["numero"])}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{s(a["titulo"])}</span>
                    <span className="block truncate text-xs text-muted-foreground">{s(as?.["nome"]) || "Sem assunto"} · {dh(a["created_at"])}{gestao ? ` · ${nomePessoa(a["aberto_para"])}` : ""}{a["origem_id"] ? " · chamado lateral" : ""}</span></span>
                  {gestao && <SlaBadge sit={sit} />}
                  <StatusBadge status={a["status"]} morador={!gestao} />
                  {a["avaliacao"] != null && <span className="inline-flex items-center gap-0.5 text-xs text-amber-600"><Star className="size-3 fill-current" />{s(a["avaliacao"])}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

/* ------------------------------- Desempenho & reputação ------------------------------- */

function Desempenho({ ctx }: { ctx: CtxAtend }) {
  const { atendimentos, assuntos, horarios, condominioId, nomeCondominio } = ctx;
  const emp = useEmpresaAtiva();
  const ini0 = new Date(); ini0.setMonth(ini0.getMonth() - 2); ini0.setDate(1);
  const [de, setDe] = useState(ini0.toLocaleDateString("sv-SE"));
  const [ate, setAte] = useState(new Date().toLocaleDateString("sv-SE"));
  const per = atendimentos.filter((a) => { const d = s(a["created_at"]).slice(0, 10); return d >= de && d <= ate; });
  const ids = per.map((a) => s(a["id"]));
  const { data: msgs = [] } = useQuery({
    queryKey: ["cond", "atend-msgs-periodo", condominioId, de, ate, ids.length], enabled: ids.length > 0,
    queryFn: async (): Promise<Row[]> => {
      const out: Row[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await db.from("cond_atend_mensagens").select("atendimento_id,autor_id,autor_nome,autor_gestao,interna,created_at").in("atendimento_id", ids.slice(i, i + 200)).order("created_at");
        out.push(...((data ?? []) as Row[]));
      }
      return out;
    },
  });
  const { data: cond } = useQuery({
    queryKey: ["cond", "empresa-doc", condominioId],
    queryFn: async () => (await db.from("empresas").select("nome,titulo,logo,cnpj_cpf").eq("id", condominioId).maybeSingle()).data as Row | null,
  });

  // Tempo de resposta da equipe: da última fala do morador (ou abertura) até a resposta da gestão, em horas úteis.
  const equipe = useMemo(() => {
    const m = new Map<string, { nome: string; respostas: number; minutos: number[] }>();
    for (const a of per) {
      let pendenteDesde: Date | null = new Date(s(a["created_at"]));
      for (const x of msgs.filter((y) => s(y["atendimento_id"]) === s(a["id"]) && !y["interna"])) {
        const t = new Date(s(x["created_at"]));
        if (x["autor_gestao"]) {
          const k = s(x["autor_id"]);
          const e = m.get(k) ?? { nome: s(x["autor_nome"]) || "Gestão", respostas: 0, minutos: [] };
          e.respostas++;
          if (pendenteDesde) { e.minutos.push(minutosUteis(pendenteDesde, t, horarios)); pendenteDesde = null; }
          m.set(k, e);
        } else if (!pendenteDesde) pendenteDesde = t;
      }
    }
    return [...m.values()].map((e) => ({ nome: e.nome, respostas: e.respostas, media: e.minutos.length ? e.minutos.reduce((a, b) => a + b, 0) / e.minutos.length : null }))
      .sort((a, b) => b.respostas - a.respostas);
  }, [per, msgs, horarios]);

  const agora = new Date();
  const comPrazo = per.filter((a) => a["prazo_sla"]);
  const noPrazo = comPrazo.filter((a) => {
    const fim = a["primeira_resposta_em"] ? new Date(s(a["primeira_resposta_em"])) : agora;
    return fim <= new Date(s(a["prazo_sla"]));
  }).length;
  const notas = per.map((a) => a["avaliacao"]).filter((v) => v != null).map(Number);
  const prim = per.filter((a) => a["primeira_resposta_em"]).map((a) => minutosUteis(new Date(s(a["created_at"])), new Date(s(a["primeira_resposta_em"])), horarios));
  const mediaPrim = prim.length ? prim.reduce((a, b) => a + b, 0) / prim.length : null;
  const finalizados = per.filter((a) => a["status"] === "finalizado").length;
  const rep = indiceReputacao({ notas, noPrazo, comPrazo: comPrazo.length, finalizados, total: per.length, mediaPrimeiraRespostaMin: mediaPrim });
  const porAssunto = alfa(assuntos.map((x) => ({ label: s(x["nome"]), total: per.filter((a) => s(a["assunto_id"]) === s(x["id"])).length }))).filter((x) => x.total).sort((a, b) => b.total - a.total).slice(0, 10);

  const [ia, setIa] = useState<AnaliseReputacao | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const analisar = async () => {
    setAnalisando(true);
    try {
      const { data } = await supabase.auth.getSession();
      const chamados = per.slice(0, 150).map((a) => ({
        assunto: s(assuntos.find((x) => s(x["id"]) === s(a["assunto_id"]))?.["nome"]).slice(0, 120) || "Sem assunto",
        status: s(a["status"]), nota: a["avaliacao"] == null ? null : Number(a["avaliacao"]), sla: situacaoSla(a as never, agora),
        texto: `${s(a["titulo"])} — ${htmlParaTexto(s(a["texto"]))} ${s(a["avaliacao_comentario"])}`.slice(0, 600),
      }));
      const r = await analisarReputacaoIA({ data: { condominio: nomeCondominio, indice: rep.indice, chamados, token: data.session?.access_token ?? "" } });
      if (r.erro) toast.error(r.erro); else setIa(r);
    } catch (e) { toast.error((e as Error).message); } finally { setAnalisando(false); }
  };
  const logo = s(cond?.["logo"]) || s(emp.logo);
  const corRep = rep.indice >= 80 ? "text-emerald-600" : rep.indice >= 65 ? "text-sky-600" : rep.indice >= 50 ? "text-amber-600" : "text-rose-600";
  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Campo label="Data inicial"><CampoData value={de} onChange={setDe} inicio={2020} /></Campo>
        <Campo label="Data final"><CampoData value={ate} onChange={setAte} inicio={2020} /></Campo>
        <Button variant="outline" onClick={analisar} disabled={analisando}>{analisando ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Analisar reputação com IA</Button>
        <Button onClick={() => imprimirElemento("cond-atend-relatorio")}><Printer className="size-4" /> Imprimir / PDF</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-[260px_1fr]">
        <div className="rounded-lg border p-4 text-center">
          <div className="text-sm text-muted-foreground">Índice de reputação da gestão</div>
          <div className={cn("text-6xl font-bold tabular-nums", corRep)}>{rep.indice}</div>
          <div className={cn("font-semibold", corRep)}>{rep.faixa}</div>
          <dl className="mt-3 grid grid-cols-2 gap-1 text-left text-xs">
            <dt className="text-muted-foreground">Satisfação</dt><dd className="text-right">{notas.length ? `${(notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(1).replace(".", ",")} ★ (${notas.length})` : "—"}</dd>
            <dt className="text-muted-foreground">SLA cumprido</dt><dd className="text-right">{pct(rep.sla)}</dd>
            <dt className="text-muted-foreground">Resolução</dt><dd className="text-right">{pct(rep.resolucao)}</dd>
            <dt className="text-muted-foreground">1ª resposta média</dt><dd className="text-right">{formatarDuracao(mediaPrim)}</dd>
          </dl>
          <p className="mt-2 text-[11px] text-muted-foreground">40% satisfação · 30% SLA · 20% resolução · 10% agilidade</p>
        </div>
        <div className="rounded-lg border p-4">
          <h3 className="mb-2 text-sm font-semibold">Desempenho da equipe (respostas e tempo médio em horas úteis)</h3>
          {!equipe.length ? <p className="text-sm text-muted-foreground">Sem respostas da gestão no período.</p> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={equipe.map((e) => ({ ...e, horas: e.media == null ? 0 : +(e.media / 60).toFixed(1) }))} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} /><YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 11, fill: "var(--foreground)" }} /><RTooltip />
                  <Bar dataKey="respostas" name="Respostas" fill="var(--primary)" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="horas" name="Tempo médio (h)" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {ia && (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <h3 className="inline-flex items-center gap-2 font-semibold"><Brain className="size-4" /> Leitura da IA — sentimento {ia.sentimento}</h3>
          <p className="text-sm">{ia.resumo}</p>
          <div className="grid gap-3 text-sm md:grid-cols-3">
            {([["Pontos fortes", ia.pontosFortes], ["Dores recorrentes", ia.dores], ["Recomendações", ia.recomendacoes]] as const).map(([t, l]) => (
              <div key={t}><div className="font-medium">{t}</div><ul className="ml-4 list-disc">{l.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-background p-2">
        <div id="cond-atend-relatorio" className="dre-doc">
          <header className="dre-head">
            <div className="dre-emp">{logo && <img src={logo} alt="" data-no-zoom />}
              <div><div className="dre-emp-nome">{s(cond?.["titulo"]) || s(cond?.["nome"]) || nomeCondominio}</div><div className="dre-rot">{s(cond?.["cnpj_cpf"]) ? `CNPJ ${s(cond?.["cnpj_cpf"])} • ` : ""}Relatório • Confidencial</div></div>
            </div>
            <div className="dre-head-dir"><div className="dre-rot">Emitido em</div><div>{new Date().toLocaleString("pt-BR")}</div></div>
          </header>
          <div className="dre-titulo"><h1>Relatório de Atendimentos</h1><p>Período de {dia(de + "T12:00")} a {dia(ate + "T12:00")}</p></div>
          <table className="dre-kpis"><tbody><tr>
            <td><span>Atendimentos</span><strong>{per.length}</strong></td>
            <td><span>Finalizados</span><strong>{finalizados}</strong></td>
            <td><span>SLA cumprido</span><strong>{pct(rep.sla)}</strong></td>
            <td><span>1ª resposta média</span><strong>{formatarDuracao(mediaPrim)}</strong></td>
            <td><span>Satisfação</span><strong>{notas.length ? `${(notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(1).replace(".", ",")} ★` : "—"}</strong></td>
            <td><span>Reputação</span><strong>{rep.indice} · {rep.faixa}</strong></td>
          </tr></tbody></table>
          <table className="dre-tab">
            <thead><tr><th>Assunto</th><th>Qtde.</th></tr></thead>
            <tbody>{porAssunto.map((x) => <tr key={x.label}><td>{x.label}</td><td>{x.total}</td></tr>)}{!porAssunto.length && <tr><td colSpan={2}>Sem atendimentos no período.</td></tr>}</tbody>
          </table>
          <table className="dre-tab">
            <thead><tr><th>Equipe</th><th>Respostas</th><th>Tempo médio (horas úteis)</th></tr></thead>
            <tbody>{equipe.map((e) => <tr key={e.nome}><td>{e.nome}</td><td>{e.respostas}</td><td>{formatarDuracao(e.media)}</td></tr>)}{!equipe.length && <tr><td colSpan={3}>Sem respostas no período.</td></tr>}</tbody>
          </table>
          {ia && <><div className="dre-titulo"><h1>Leitura da IA</h1><p>{ia.resumo}</p></div></>}
          <footer className="dre-rodape">Índice estatístico: 40% satisfação, 30% SLA, 20% resolução, 10% agilidade da 1ª resposta. Documento de uso interno.</footer>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- Assuntos & SLA ------------------------------- */

function Assuntos({ condominioId, assuntos, canEdit }: { condominioId: string; assuntos: Row[]; canEdit: boolean }) {
  const qc = useQueryClient();
  const recarregar = () => qc.invalidateQueries({ queryKey: ["cond", "atend-assuntos", condominioId] });
  const { data: catalogo = [] } = useQuery({
    queryKey: ["cond", "atend-catalogo"],
    queryFn: async (): Promise<Row[]> => ((await db.from("cond_atend_catalogo").select("*").eq("status", true).order("nome")).data ?? []) as Row[],
  });
  const { data: equipe = [] } = useQuery({
    queryKey: ["cond", "cond_equipe", "condominio_id", condominioId],
    queryFn: async (): Promise<Row[]> => ((await db.from("cond_equipe").select("id,nome,cargo,status").eq("condominio_id", condominioId)).data ?? []) as Row[],
  });
  const [novoNome, setNovoNome] = useState("");
  const [busca, setBusca] = useState("");
  const usados = new Set(assuntos.map((a) => s(a["nome"]).toLowerCase()));
  const disponiveis = catalogo.filter((c) => !usados.has(s(c["nome"]).toLowerCase()));
  const lista = [...assuntos].sort((a, b) => s(a["nome"]).localeCompare(s(b["nome"]), "pt-BR")).filter((a) => !busca || s(a["nome"]).toLowerCase().includes(busca.toLowerCase()));

  const salvar = async (id: string, patch: Row) => {
    const { error } = await db.from("cond_atend_assuntos").update(patch).eq("id", id);
    if (error) toast.error(error.message); else recarregar();
  };
  const incluir = async (c: Row | null, nome?: string) => {
    const { error } = await db.from("cond_atend_assuntos").insert({ condominio_id: condominioId, catalogo_id: c ? c["id"] : null, nome: c ? c["nome"] : nome, sla_horas: c ? c["sla_horas"] : 24 });
    if (error) toast.error(error.code === "23505" ? "Esse assunto já existe." : error.message); else { recarregar(); setNovoNome(""); }
  };
  const incluirTodos = async () => {
    if (!disponiveis.length) return;
    const { error } = await db.from("cond_atend_assuntos").insert(disponiveis.map((c) => ({ condominio_id: condominioId, catalogo_id: c["id"], nome: c["nome"], sla_horas: c["sla_horas"] })));
    if (error) toast.error(error.message); else recarregar();
  };
  const excluir = async (a: Row) => {
    if (!(await confirmar({ title: `Remover "${s(a["nome"])}"?`, description: "Atendimentos antigos continuam, mas ficam sem assunto.", confirmText: "Remover", variant: "destructive" }))) return;
    const { error } = await db.from("cond_atend_assuntos").delete().eq("id", a["id"]);
    if (error) toast.error(error.message); else recarregar();
  };
  const opEquipe = alfa(equipe.filter((e) => e["status"] !== false).map((e) => ({ value: s(e["id"]), label: s(e["nome"]) })));

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <div className="space-y-3 rounded-lg border p-3">
        <h3 className="text-sm font-semibold">Assuntos pré-formatados disponíveis</h3>
        {canEdit && disponiveis.length > 0 && <Button size="sm" variant="outline" onClick={incluirTodos}><Plus className="size-4" /> Incluir todos</Button>}
        <ul className="max-h-[420px] space-y-1 overflow-y-auto">
          {disponiveis.map((c) => (
            <li key={s(c["id"])} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
              <span>{s(c["nome"])} <span className="text-xs text-muted-foreground">· {s(c["sla_horas"])}h</span></span>
              {canEdit && <Button size="icon" variant="ghost" className="size-7" aria-label={`Incluir ${s(c["nome"])}`} onClick={() => incluir(c)}><Plus className="size-4" /></Button>}
            </li>
          ))}
          {!disponiveis.length && <li className="text-xs text-muted-foreground">Todos os assuntos do catálogo já estão no condomínio.</li>}
        </ul>
        {canEdit && (
          <div className="flex gap-2 border-t pt-3"><Input value={novoNome} maxLength={80} onChange={(e) => setNovoNome(e.target.value)} placeholder="Assunto próprio do condomínio" />
            <Button onClick={() => novoNome.trim() && incluir(null, novoNome.trim())} disabled={!novoNome.trim()}>Criar</Button></div>
        )}
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold"><Settings2 className="size-4" /> Assuntos do condomínio · nível de atendimento (SLA em horas úteis)</h3>
          <div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar assunto" aria-label="Buscar assunto" /></div>
        </div>
        {!lista.length ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Inclua assuntos do catálogo ao lado para os moradores abrirem atendimentos.</p> : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr><th className="p-2">Assunto</th><th className="p-2 w-24">SLA (h)</th><th className="p-2">Responsáveis</th><th className="p-2 w-28">Morador vê</th><th className="p-2 w-24">Ativo</th><th className="p-2 w-12" /></tr></thead>
              <tbody>
                {lista.map((a) => {
                  const resp = ((a["responsaveis"] as string[]) ?? []).map(String);
                  return (
                    <tr key={s(a["id"])} className="border-t align-top">
                      <td className="p-2 font-medium">{s(a["nome"])}</td>
                      <td className="p-2"><Input type="number" min={1} max={720} defaultValue={s(a["sla_horas"])} disabled={!canEdit} aria-label={`SLA de ${s(a["nome"])}`}
                        onBlur={(e) => { const v = Math.max(1, Math.min(720, Number(e.target.value) || 24)); if (v !== Number(a["sla_horas"])) void salvar(s(a["id"]), { sla_horas: v }); }} /></td>
                      <td className="p-2">
                        <div className="mb-1 flex flex-wrap gap-1">{resp.map((r) => (
                          <span key={r} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">{s(equipe.find((e) => s(e["id"]) === r)?.["nome"]) || "—"}
                            {canEdit && <button type="button" aria-label="Remover responsável" onClick={() => salvar(s(a["id"]), { responsaveis: resp.filter((x) => x !== r) })}>×</button>}</span>
                        ))}{!resp.length && <span className="text-xs text-muted-foreground">Síndico e gerente</span>}</div>
                        {canEdit && <SearchSelect value="" placeholder="Adicionar responsável" onChange={(v) => v && !resp.includes(v) && salvar(s(a["id"]), { responsaveis: [...resp, v] })} options={opEquipe.filter((o) => !resp.includes(o.value))} />}
                      </td>
                      <td className="p-2"><Switch checked={a["visivel_morador"] !== false} disabled={!canEdit} onCheckedChange={(c) => salvar(s(a["id"]), { visivel_morador: c })} aria-label="Visível ao morador" /></td>
                      <td className="p-2"><Switch checked={a["status"] !== false} disabled={!canEdit} onCheckedChange={(c) => salvar(s(a["id"]), { status: c })} aria-label="Ativo" /></td>
                      <td className="p-2">{canEdit && <Button size="icon" variant="ghost" className="size-8" aria-label={`Remover ${s(a["nome"])}`} onClick={() => excluir(a)}><Trash2 className="size-4" /></Button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Responsáveis vêm de Equipe & Diretoria; com mais de um, todos recebem o aviso e interagem no chamado. Sem responsáveis, síndico e gerente são avisados.</p>
      </div>
    </div>
  );
}

/* ------------------------------- Horário de atendimento ------------------------------- */

function Horario({ condominioId, horarios, canEdit }: { condominioId: string; horarios: Horarios; canEdit: boolean }) {
  const qc = useQueryClient();
  const [h, setH] = useState<{ ini: string; fim: string }[]>(() => horarios.map((d) => ({ ini: d ? String(d[0]) : "", fim: d ? String(d[1]) : "" })));
  useEffect(() => { setH(horarios.map((d) => ({ ini: d ? String(d[0]) : "", fim: d ? String(d[1]) : "" }))); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(horarios)]);
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    const grade: Horarios = h.map((d) => (d.ini === "" || d.fim === "" ? null : [Number(d.ini), Number(d.fim)]));
    if (grade.some((d) => d && (d[1] <= d[0] || d[0] < 0 || d[1] > 24))) { toast.error("A hora fim deve ser maior que a hora início (0 a 24)."); return; }
    setSalvando(true);
    const { error } = await db.from("cond_atend_config").upsert({ condominio_id: condominioId, horarios: grade, updated_at: new Date().toISOString() });
    setSalvando(false);
    if (error) toast.error(error.message); else { toast.success("Horário salvo. Novos prazos de SLA usam esta grade."); qc.invalidateQueries({ queryKey: ["cond", "atend-config", condominioId] }); }
  };
  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-sm text-muted-foreground">Deixe início e fim em branco nos dias sem atendimento. O SLA conta só as horas dentro desta grade.</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left"><tr><th className="p-2">Dia</th><th className="p-2">Hora início</th><th className="p-2">Hora fim</th></tr></thead>
          <tbody>{DIAS_SEMANA.map((d, i) => (
            <tr key={d} className="border-t"><td className="p-2">{d}</td>
              {(["ini", "fim"] as const).map((k) => (
                <td key={k} className="p-2"><Input type="number" min={0} max={24} disabled={!canEdit} aria-label={`${d} ${k === "ini" ? "início" : "fim"}`} value={h[i]?.[k] ?? ""}
                  onChange={(e) => setH((l) => l.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} /></td>
              ))}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {canEdit && <div className="flex justify-end"><Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="size-4 animate-spin" />} Salvar</Button></div>}
    </div>
  );
}
