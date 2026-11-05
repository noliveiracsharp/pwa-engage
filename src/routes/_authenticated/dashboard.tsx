import { createContext, useContext, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle, Bell, CheckCircle2, ClipboardList, FolderKanban, Headphones, HandCoins,
  ShoppingCart, TrendingUp, Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAudit } from "@/lib/audit";
import { useAuth } from "@/hooks/useAuth";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { EVENTOS } from "@/lib/projetos-eventos";
import { formatBRL } from "@/lib/orcamentos";
import { COTACAO_STATUS } from "@/lib/laudos";
import { pick, type Row } from "@/lib/row";
import { etapasDoKanban, kanbanDoModulo, type EtapaKanban } from "@/lib/orcamento-kanban";
import { ChecklistImplantacao } from "@/components/dashboard/ChecklistImplantacao";
import { useIdioma, type ChaveTraducao } from "@/lib/i18n";

const normTxt = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
type GrupoEtapa = EtapaKanban & { n: number; v: number };

/** Agrupa registros nas etapas reais do Kanban (por etapa_id; senão pela situação/status com o mesmo nome). */
function agruparPorEtapas(etapas: EtapaKanban[], rows: Row[], campoTexto: string[], valor?: (r: Row) => number) {
  const grupos: GrupoEtapa[] = etapas.map((e) => ({ ...e, n: 0, v: 0 }));
  const porId = new Map(grupos.map((g) => [g.id, g]));
  const porNome = new Map(grupos.map((g) => [normTxt(g.descricao), g]));
  let semEtapa = 0;
  for (const r of rows) {
    const id = String(pick(r, ["kanban_etapa_id", "etapa_id", "id_etapa"]) ?? "");
    const g = porId.get(id) ?? porNome.get(normTxt(pick(r, campoTexto)));
    if (!g) { semEtapa++; continue; }
    g.n++; g.v += valor ? valor(r) : 0;
  }
  return { grupos, semEtapa };
}

const TONS: Record<string, string> = {
  verde: "border-l-success", vermelho: "border-l-destructive", amarelo: "border-l-warning", laranja: "border-l-warning",
  azul: "border-l-primary", padrao: "border-l-border",
};
function KpiEtapa({ g, valor }: { g: GrupoEtapa; valor?: boolean }) {
  const borda = TONS[normTxt(g.cor)] ?? "border-l-primary";
  return (
    <Card className={`border-l-4 ${g.ganha ? "border-l-success" : borda}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{g.descricao} ({g.n})</CardTitle>
        {g.ganha ? <CheckCircle2 className="h-4 w-4 text-success" /> : <FolderKanban className="h-4 w-4 text-primary" />}
      </CardHeader>
      <CardContent><p className="text-2xl font-bold text-foreground">{valor ? formatBRL(g.v) : g.n}</p></CardContent>
    </Card>
  );
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Dashboard — Atende.ai" },
      { name: "description", content: "Seu painel com tarefas, atualizações e indicadores das áreas que você acessa." },
      { property: "og:title", content: "Dashboard — Atende.ai" },
      { property: "og:description", content: "Seu painel com tarefas, atualizações e indicadores das áreas que você acessa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

type Periodo = "mes" | "ano";
const hoje = () => new Date().toISOString().slice(0, 10);

function periodStart(periodo: Periodo) {
  const now = new Date();
  if (periodo === "mes") return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(now.getFullYear(), now.getMonth() - 11, 1);
}

async function rowsOf(table: string, empId: unknown, build?: (q: any) => any): Promise<Row[]> {
  try {
    let q: any = supabase.from(table as never).select("*");
    if (Array.isArray(empId)) q = q.in("empresa_id", empId);
    else if (empId !== undefined) q = q.eq("empresa_id", empId);
    if (build) q = build(q);
    const { data, error } = await q.limit(2000);
    return error ? [] : ((data ?? []) as Row[]);
  } catch {
    return [];
  }
}

async function countOf(table: string, empId: unknown, build?: (q: any) => any) {
  try {
    let q: any = supabase.from(table as never).select("*", { count: "exact", head: true });
    if (Array.isArray(empId)) q = q.in("empresa_id", empId);
    else if (empId !== undefined) q = q.eq("empresa_id", empId);
    if (build) q = build(q);
    const { count, error } = await q;
    return error ? 0 : count ?? 0;
  } catch {
    return 0;
  }
}

/** Empresas consideradas nos painéis (consolidado da matriz ou unidade escolhida). */
const EscopoCtx = createContext<unknown>(undefined);
function useEscopo() {
  const { empresaId } = useAudit();
  const escopo = useContext(EscopoCtx);
  return escopo ?? empresaId;
}

const isDone = (r: Row) => {
  const p = Number(r["progresso"]);
  if (!isNaN(p) && p >= 100) return true;
  return /conclu|finaliz/i.test(String(pick(r, ["situacao", "status"]) ?? ""));
};
const fmtData = (v: unknown) => (v ? String(v).slice(0, 10).split("-").reverse().join("/") : "—");

function Kpi({ title, value, icon: Icon, tone = "primary" }: { title: string; value: ReactNode; icon: typeof Users; tone?: "primary" | "warning" | "destructive" | "success" }) {
  const cls = { primary: "text-primary", warning: "text-warning", destructive: "text-destructive", success: "text-success" }[tone];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${cls}`} />
      </CardHeader>
      <CardContent><p className="text-2xl font-bold text-foreground">{value}</p></CardContent>
    </Card>
  );
}

function Secao({ title, icon: Icon, children }: { title: string; icon: typeof Users; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground"><Icon className="h-5 w-5 text-primary" />{title}</h2>
      {children}
    </section>
  );
}

/* ---------------- Meu trabalho ---------------- */
function MeuTrabalho() {
  const { t, idioma } = useIdioma();
  const { usuarioId } = useAudit();
  const uid = String(usuarioId ?? "");
  const { data } = useQuery({
    queryKey: ["dashboard", "meu-trabalho", uid],
    enabled: Boolean(uid),
    queryFn: async () => {
      const [tarefas, atividades, eventos] = await Promise.all([
        rowsOf("projetos_tarefas", undefined, (q) => q.contains("responsaveis", [uid])),
        rowsOf("projetos_atividades", undefined, (q) => q.contains("responsaveis", [uid])),
        rowsOf(EVENTOS, undefined, (q) => q.eq("usuario_id", uid).order("created_at", { ascending: false })),
      ]);
      const itens = [
        ...tarefas.map((t) => ({ tipo: "Tarefa", nome: String(pick(t, ["nome", "titulo", "descricao"]) ?? ""), fim: pick(t, ["dt_fim", "data_fim", "dt_prazo"]), r: t })),
        ...atividades.map((a) => ({ tipo: "Atividade", nome: String(a["nome"] ?? ""), fim: a["dt_fim"], r: a })),
      ].filter((i) => !isDone(i.r));
      itens.sort((a, b) => String(a.fim ?? "9999").localeCompare(String(b.fim ?? "9999")));
      return { itens, eventos: eventos.slice(0, 15) };
    },
  });
  const h = hoje();
  const itens = data?.itens ?? [];
  const atrasadas = itens.filter((i) => i.fim && String(i.fim).slice(0, 10) < h).length;
  const doDia = itens.filter((i) => i.fim && String(i.fim).slice(0, 10) === h).length;

  return (
    <Secao title={t("dash.meuTrabalho")} icon={ClipboardList}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi title={t("dash.pendentesComigo")} value={itens.length} icon={ClipboardList} />
        <Kpi title={t("dash.vencemHoje")} value={doDia} icon={Bell} tone="warning" />
        <Kpi title={t("dash.atrasadas")} value={atrasadas} icon={AlertTriangle} tone="destructive" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">{t("dash.minhasTarefas")}</CardTitle></CardHeader>
          <CardContent className="max-h-80 space-y-2 overflow-y-auto">
            {itens.length === 0 && <p className="text-sm text-muted-foreground">{t("dash.nadaPendente")}</p>}
            {itens.slice(0, 30).map((i, idx) => {
              const d = i.fim ? String(i.fim).slice(0, 10) : "";
              const tone = d && d < h ? "bg-destructive" : d === h ? "bg-warning" : "bg-success";
              return (
                <Link key={idx} to="/projetos" search={buscaItem(i.tipo === "Tarefa" ? pick(i.r, ["projeto_id", "projeto"]) : null, i.tipo === "Tarefa" ? i.r["id"] : i.r["tarefa_id"])} className="flex items-center gap-3 rounded-md border border-border p-2 text-sm hover:bg-accent">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone}`} />
                  <span className="min-w-0 flex-1 truncate"><span className="text-muted-foreground">{t(i.tipo === "Tarefa" ? "dash.tarefa" : "dash.atividade")}: </span>{i.nome}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtData(i.fim)}</span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">{t("dash.atualizacoes")}</CardTitle></CardHeader>
          <CardContent className="max-h-80 space-y-2 overflow-y-auto">
            {(data?.eventos ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t("dash.semAtualizacoes")}</p>}
            {(data?.eventos ?? []).map((e) => (
              <Link key={String(e["id"])} to="/projetos" search={buscaItem(e["projeto_id"], e["tarefa_id"])} className="block rounded-md border border-border p-2 text-sm hover:bg-accent">
                <p className="text-foreground">{String(e["descricao"] ?? "")}</p>
                <p className="text-xs text-muted-foreground">{new Date(String(e["created_at"])).toLocaleString(idioma)}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </Secao>
  );
}

/** Parâmetros do link direto: abre o projeto e a tarefa em /projetos. */
function buscaItem(projetoId: unknown, tarefaId: unknown): { projeto?: string; tarefa?: string } {
  const s: { projeto?: string; tarefa?: string } = {};
  if (projetoId) s.projeto = String(projetoId);
  if (tarefaId) s.tarefa = String(tarefaId);
  return s;
}

/* ---------------- Projetos ---------------- */
function PainelProjetos() {
  const { t } = useIdioma();
  const empresaId = useEscopo();
  const { data } = useQuery({
    queryKey: ["dashboard", "projetos", empresaId],
    queryFn: async () => {
      const rows = await rowsOf("projetos", empresaId);
      const h = hoje();
      const ativos = rows.filter((r) => !isDone(r));
      const atrasados = ativos.filter((r) => { const f = pick(r, ["dt_fim", "data_fim", "dt_previsao"]); return f && String(f).slice(0, 10) < h; });
      const semana = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
      const entregas = ativos.filter((r) => { const f = String(pick(r, ["dt_fim", "data_fim", "dt_previsao"]) ?? "").slice(0, 10); return f && f >= h && f <= semana; });
      return { ativos: ativos.length, atrasados: atrasados.length, entregas: entregas.length, concluidos: rows.length - ativos.length };
    },
  });
  return (
    <Secao title={t("dash.projetos")} icon={FolderKanban}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title={t("dash.projetosAtivos")} value={data?.ativos ?? 0} icon={FolderKanban} />
        <Kpi title={t("dash.prazoVencido")} value={data?.atrasados ?? 0} icon={AlertTriangle} tone="destructive" />
        <Kpi title={t("dash.entregas7")} value={data?.entregas ?? 0} icon={Bell} tone="warning" />
        <Kpi title={t("dash.concluidos")} value={data?.concluidos ?? 0} icon={CheckCircle2} tone="success" />
      </div>
    </Secao>
  );
}

/* ---------------- Compras ---------------- */
function PainelCompras() {
  const { t } = useIdioma();
  const empresaId = useEscopo();
  const { data } = useQuery({
    queryKey: ["dashboard", "cotacoes", empresaId],
    queryFn: async () => {
      const rows = await rowsOf("cotacoes", empresaId);
      const por = new Map<string, number>();
      for (const r of rows) por.set(String(r["status"] ?? "pendente"), (por.get(String(r["status"] ?? "pendente")) ?? 0) + 1);
      return por;
    },
  });
  const { usuarioId } = useAudit();
  // Cotações aguardando o voto deste usuário (aprovador principal ou adicional da alçada).
  const { data: minhas = [] } = useQuery({
    queryKey: ["dashboard", "cotacoes-minha-aprovacao", empresaId, usuarioId],
    enabled: usuarioId != null,
    queryFn: async () => {
      const { data: cfg } = await supabase.from("compras_workflow_config" as never).select("*").eq("empresa_id", empresaId as never).maybeSingle();
      const c = cfg as Row | null;
      if (!c || c["ativo"] !== true) return [] as Row[];
      let ad = c["aprovadores_adicionais"];
      if (typeof ad === "string") { try { ad = JSON.parse(ad); } catch { ad = []; } }
      const lista = [String(c["aprovador_principal_id"] ?? ""), ...(Array.isArray(ad) ? ad.map(String) : [])];
      const uid = String(usuarioId);
      if (!lista.includes(uid)) return [] as Row[];
      const pend = await rowsOf("cotacoes", empresaId, (q) => q.eq("status", "aguardando_aprovacao"));
      if (!pend.length) return [] as Row[];
      const { data: votos } = await supabase.from("cotacao_aprovacoes" as never).select("cotacao_id").eq("usuario_id", uid as never).in("cotacao_id", pend.map((p) => String(p["id"])) as never);
      const votadas = new Set(((votos ?? []) as Row[]).map((v) => String(v["cotacao_id"])));
      return pend.filter((p) => !votadas.has(String(p["id"])));
    },
  });
  const tone = { pendente: "primary", em_cotacao: "warning", cotado: "primary", aguardando_aprovacao: "warning", aprovado: "success", pedido_gerado: "success", reprovado: "destructive", cancelado: "destructive" } as const;
  return (
    <Secao title={t("dash.compras")} icon={ShoppingCart}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {COTACAO_STATUS.map((s) => (
          <Kpi key={s.value} title={t(`cot.${s.value}` as ChaveTraducao) ?? s.label} value={data?.get(s.value) ?? 0} icon={ShoppingCart} tone={tone[s.value as keyof typeof tone]} />
        ))}
      </div>
      {minhas.length > 0 && (
        <div className="rounded-lg border border-warning/50 bg-warning/10 p-4">
          <div className="mb-2 flex items-center gap-2 font-semibold text-foreground"><Bell className="h-4 w-4 text-warning" />{t("dash.cotacoesMinhas", { n: minhas.length })}</div>
          <ul className="space-y-1 text-sm">
            {minhas.slice(0, 8).map((c) => (
              <li key={String(c["id"])} className="flex items-center justify-between gap-2">
                <span className="truncate">{String(c["numero"] ?? "")} · {String(c["titulo"] || c["projeto_nome"] || "")}</span>
                <Link to="/cotacoes" search={{ id: String(c["id"]) } as never} className="shrink-0 text-primary hover:underline">{t("dash.revisar")}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Secao>
  );
}

/* ---------------- Comercial ---------------- */
function PainelComercial({ periodo }: { periodo: Periodo }) {
  const { t } = useIdioma();
  const { usuarioId } = useAudit();
  const empresaId = useEscopo();
  const since = periodStart(periodo).toISOString();
  const { data } = useQuery({
    queryKey: ["dashboard", "ofertas", empresaId, periodo, usuarioId],
    queryFn: async () => {
      const [rows, comissoes] = await Promise.all([
        rowsOf("orcamentos", empresaId, (q) => q.gte("created_at", since)),
        rowsOf("orcamento_comissoes", empresaId, (q) => q.eq("beneficiario_id", usuarioId)),
      ]);
      const val = (r: Row) => Number(pick(r, ["total_liquido", "valor_total", "total"]) ?? 0) || 0;
      const kanbanId = await kanbanDoModulo("orcamentos", "orcamento");
      const etapas = await etapasDoKanban(kanbanId);
      const { grupos, semEtapa } = agruparPorEtapas(etapas, rows, ["situacao"], val);
      const ganhas = grupos.filter((g) => g.ganha);
      const nG = ganhas.reduce((t, g) => t + g.n, 0);
      const vG = ganhas.reduce((t, g) => t + g.v, 0);
      const conv = rows.length ? Math.round((nG / rows.length) * 100) : 0;
      const ticket = nG ? vG / nG : 0;
      const minhas = comissoes.filter((c) => c["status"] !== "paga").reduce((t, c) => t + (Number(c["valor"]) || 0), 0);
      return { grupos, semEtapa, conv, ticket, minhas, temKanban: !!kanbanId, temGanha: ganhas.length > 0 };
    },
  });
  return (
    <Secao title={t("dash.comercial")} icon={TrendingUp}>
      {data && !data.temKanban && <p className="text-sm text-muted-foreground">{t("dash.vincularOfertas")}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(data?.grupos ?? []).map((g) => <KpiEtapa key={g.id} g={g} valor />)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi title={data?.temGanha === false ? t("dash.conversaoMarque") : t("dash.conversao")} value={`${data?.conv ?? 0}%`} icon={TrendingUp} />
        <Kpi title={t("dash.ticket")} value={formatBRL(data?.ticket ?? 0)} icon={TrendingUp} />
        <Kpi title={t("dash.comissoes")} value={formatBRL(data?.minhas ?? 0)} icon={HandCoins} tone="success" />
      </div>
      {!!data?.semEtapa && <p className="text-xs text-muted-foreground">{t("dash.semEtapa", { n: data.semEtapa })}</p>}
    </Secao>
  );
}

/* ---------------- Atendimento ---------------- */
function PainelAtendimento() {
  const { t, idioma } = useIdioma();
  const empresaId = useEscopo();
  const { data } = useQuery({
    queryKey: ["dashboard", "atendimentos", empresaId, idioma],
    queryFn: async () => {
      const [kanbanId, pessoas, todos] = await Promise.all([
        kanbanDoModulo("atendimentos", "atendimento"),
        countOf("pessoas", empresaId),
        rowsOf("atendimentos", empresaId),
      ]);
      const etapas = await etapasDoKanban(kanbanId);
      const { grupos } = agruparPorEtapas(etapas, todos, ["status", "situacao"]);
      const rows = await rowsOf("atendimentos", empresaId, (q) => q.gte("created_at", periodStart("ano").toISOString()));
      const meses = new Map<string, number>();
      for (const r of rows) {
        const m = new Date(String(r["created_at"])).toLocaleDateString(idioma, { month: "short", year: "2-digit" });
        meses.set(m, (meses.get(m) ?? 0) + 1);
      }
      return { grupos, temKanban: !!kanbanId, pessoas, porMes: [...meses].map(([label, total]) => ({ label, total })) };
    },
  });
  return (
    <Secao title={t("dash.atendimento")} icon={Headphones}>
      {data && !data.temKanban && <p className="text-sm text-muted-foreground">{t("dash.vincularAtend")}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(data?.grupos ?? []).map((g) => <KpiEtapa key={g.id} g={g} />)}
        <Kpi title={t("dash.contatos")} value={data?.pessoas ?? 0} icon={Users} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">{t("dash.atendPorMes")}</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.porMes ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip />
              <Bar dataKey="total" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </Secao>
  );
}

function Dashboard() {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const { t } = useIdioma();
  const { usuario } = useAuth();
  const projetos = usePagePermissions("/projetos").canRead;
  const cotacoes = usePagePermissions("/cotacoes").canRead;
  const ofertas = usePagePermissions("/orcamentos").canRead;
  const atend = usePagePermissions("/atendimentos").canRead;
  const { empresaId } = useAudit();
  const [unidade, setUnidade] = useState("todas");
  const { data: filiais = [] } = useQuery({
    queryKey: ["dashboard", "filiais", empresaId],
    enabled: empresaId != null,
    queryFn: async () => {
      const { data } = await supabase.from("empresas").select("*").eq("empresa_pai_id", empresaId as never);
      return ((data ?? []) as Row[]).filter((r) => r["is_tenant"] !== false);
    },
  });
  const escopo = !filiais.length || empresaId == null ? undefined
    : unidade === "todas" ? [empresaId, ...filiais.map((f) => f["id"])] : unidade;
  const nome = String(usuario?.["nome"] ?? "").split(" ")[0];
  const hora = new Date().getHours();
  const saud = t(hora < 12 ? "dash.bomDia" : hora < 18 ? "dash.boaTarde" : "dash.boaNoite");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{saud}{nome ? `, ${nome}` : ""}</h1>
          <p className="text-sm text-muted-foreground">{t("dash.subtitulo")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
        {filiais.length > 0 && (
          <Select value={unidade} onValueChange={setUnidade}>
            <SelectTrigger className="w-60" aria-label={t("dash.unidade")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">{t("dash.consolidado")}</SelectItem>
              <SelectItem value={String(empresaId)}>{t("dash.matriz")}</SelectItem>
              {filiais.map((f) => (
                <SelectItem key={String(f["id"])} value={String(f["id"])}>{String(pick(f, ["titulo", "nome"]) ?? t("dash.filial"))}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {ofertas && (
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mes">{t("dash.mesAtual")}</SelectItem>
              <SelectItem value="ano">{t("dash.ultimos12")}</SelectItem>
            </SelectContent>
          </Select>
        )}
        </div>
      </div>
      <ChecklistImplantacao />
      <EscopoCtx.Provider value={escopo}>
      <MeuTrabalho />
      {projetos && <PainelProjetos />}
      {ofertas && <PainelComercial periodo={periodo} />}
      {cotacoes && <PainelCompras />}
      {atend && <PainelAtendimento />}
      </EscopoCtx.Provider>
    </div>
  );
}
