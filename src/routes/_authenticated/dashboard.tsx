import { useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle, Bell, Bot, CheckCircle2, ClipboardList, FolderKanban, Headphones, HandCoins,
  ShoppingCart, TrendingUp, Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAudit } from "@/lib/audit";
import { useAuth } from "@/hooks/useAuth";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { EVENTOS } from "@/lib/projetos-eventos";
import { formatBRL, situacaoOf } from "@/lib/orcamentos";
import { COTACAO_STATUS } from "@/lib/laudos";
import { pick, type Row } from "@/lib/row";

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
    if (empId !== undefined) q = q.eq("empresa_id", empId);
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
    if (empId !== undefined) q = q.eq("empresa_id", empId);
    if (build) q = build(q);
    const { count, error } = await q;
    return error ? 0 : count ?? 0;
  } catch {
    return 0;
  }
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
    <Secao title="Meu trabalho" icon={ClipboardList}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi title="Pendentes comigo" value={itens.length} icon={ClipboardList} />
        <Kpi title="Vencem hoje" value={doDia} icon={Bell} tone="warning" />
        <Kpi title="Atrasadas" value={atrasadas} icon={AlertTriangle} tone="destructive" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Minhas tarefas e atividades</CardTitle></CardHeader>
          <CardContent className="max-h-80 space-y-2 overflow-y-auto">
            {itens.length === 0 && <p className="text-sm text-muted-foreground">Nada pendente com você. 🎉</p>}
            {itens.slice(0, 30).map((i, idx) => {
              const d = i.fim ? String(i.fim).slice(0, 10) : "";
              const tone = d && d < h ? "bg-destructive" : d === h ? "bg-warning" : "bg-success";
              return (
                <Link key={idx} to="/projetos" className="flex items-center gap-3 rounded-md border border-border p-2 text-sm hover:bg-accent">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone}`} />
                  <span className="min-w-0 flex-1 truncate"><span className="text-muted-foreground">{i.tipo}: </span>{i.nome}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtData(i.fim)}</span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Atualizações para você</CardTitle></CardHeader>
          <CardContent className="max-h-80 space-y-2 overflow-y-auto">
            {(data?.eventos ?? []).length === 0 && <p className="text-sm text-muted-foreground">Sem atualizações recentes.</p>}
            {(data?.eventos ?? []).map((e) => (
              <div key={String(e["id"])} className="rounded-md border border-border p-2 text-sm">
                <p className="text-foreground">{String(e["descricao"] ?? "")}</p>
                <p className="text-xs text-muted-foreground">{new Date(String(e["created_at"])).toLocaleString("pt-BR")}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </Secao>
  );
}

/* ---------------- Projetos ---------------- */
function PainelProjetos() {
  const { empresaId } = useAudit();
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
    <Secao title="Projetos" icon={FolderKanban}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Projetos ativos" value={data?.ativos ?? 0} icon={FolderKanban} />
        <Kpi title="Com prazo vencido" value={data?.atrasados ?? 0} icon={AlertTriangle} tone="destructive" />
        <Kpi title="Entregas em 7 dias" value={data?.entregas ?? 0} icon={Bell} tone="warning" />
        <Kpi title="Concluídos" value={data?.concluidos ?? 0} icon={CheckCircle2} tone="success" />
      </div>
    </Secao>
  );
}

/* ---------------- Compras ---------------- */
function PainelCompras() {
  const { empresaId } = useAudit();
  const { data } = useQuery({
    queryKey: ["dashboard", "cotacoes", empresaId],
    queryFn: async () => {
      const rows = await rowsOf("cotacoes", empresaId);
      const por = new Map<string, number>();
      for (const r of rows) por.set(String(r["status"] ?? "pendente"), (por.get(String(r["status"] ?? "pendente")) ?? 0) + 1);
      return por;
    },
  });
  const tone = { pendente: "primary", em_cotacao: "warning", cotado: "primary", aprovado: "success", cancelado: "destructive" } as const;
  return (
    <Secao title="Compras e cotações" icon={ShoppingCart}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {COTACAO_STATUS.map((s) => (
          <Kpi key={s.value} title={s.label} value={data?.get(s.value) ?? 0} icon={ShoppingCart} tone={tone[s.value as keyof typeof tone]} />
        ))}
      </div>
    </Secao>
  );
}

/* ---------------- Comercial ---------------- */
function PainelComercial({ periodo }: { periodo: Periodo }) {
  const { empresaId, usuarioId } = useAudit();
  const since = periodStart(periodo).toISOString();
  const { data } = useQuery({
    queryKey: ["dashboard", "ofertas", empresaId, periodo, usuarioId],
    queryFn: async () => {
      const [rows, comissoes] = await Promise.all([
        rowsOf("orcamentos", empresaId, (q) => q.gte("created_at", since)),
        rowsOf("orcamento_comissoes", empresaId, (q) => q.eq("beneficiario_id", usuarioId)),
      ]);
      const val = (r: Row) => Number(pick(r, ["total_liquido", "valor_total", "total"]) ?? 0) || 0;
      const g = { andamento: { n: 0, v: 0 }, aprovado: { n: 0, v: 0 }, reprovado: { n: 0, v: 0 } };
      for (const r of rows) {
        const s = situacaoOf(r["situacao"]);
        const k = s === "Aprovado" ? "aprovado" : s === "Reprovado" ? "reprovado" : "andamento";
        g[k].n++; g[k].v += val(r);
      }
      const decididas = g.aprovado.n + g.reprovado.n;
      const conv = decididas ? Math.round((g.aprovado.n / decididas) * 100) : 0;
      const ticket = g.aprovado.n ? g.aprovado.v / g.aprovado.n : 0;
      const minhas = comissoes.filter((c) => c["status"] !== "paga").reduce((t, c) => t + (Number(c["valor"]) || 0), 0);
      return { g, conv, ticket, minhas };
    },
  });
  return (
    <Secao title="Comercial — Ofertas" icon={TrendingUp}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi title={`Em negociação (${data?.g.andamento.n ?? 0})`} value={formatBRL(data?.g.andamento.v ?? 0)} icon={TrendingUp} tone="warning" />
        <Kpi title={`Aprovadas (${data?.g.aprovado.n ?? 0})`} value={formatBRL(data?.g.aprovado.v ?? 0)} icon={CheckCircle2} tone="success" />
        <Kpi title="Taxa de conversão" value={`${data?.conv ?? 0}%`} icon={TrendingUp} />
        <Kpi title="Ticket médio aprovado" value={formatBRL(data?.ticket ?? 0)} icon={TrendingUp} />
        <Kpi title={`Reprovadas (${data?.g.reprovado.n ?? 0})`} value={formatBRL(data?.g.reprovado.v ?? 0)} icon={AlertTriangle} tone="destructive" />
        <Kpi title="Minhas comissões a receber" value={formatBRL(data?.minhas ?? 0)} icon={HandCoins} tone="success" />
      </div>
    </Secao>
  );
}

/* ---------------- Atendimento ---------------- */
function PainelAtendimento() {
  const { empresaId } = useAudit();
  const { data } = useQuery({
    queryKey: ["dashboard", "atendimentos", empresaId],
    queryFn: async () => {
      const [comIA, emAtendimento, encerrados, pessoas] = await Promise.all([
        countOf("atendimentos", empresaId, (q) => q.eq("status", "IA")),
        countOf("atendimentos", empresaId, (q) => q.eq("status", "Em atendimento")),
        countOf("atendimentos", empresaId, (q) => q.eq("status", "Encerrado")),
        countOf("pessoas", empresaId),
      ]);
      const rows = await rowsOf("atendimentos", empresaId, (q) => q.gte("created_at", periodStart("ano").toISOString()));
      const meses = new Map<string, number>();
      for (const r of rows) {
        const m = new Date(String(r["created_at"])).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
        meses.set(m, (meses.get(m) ?? 0) + 1);
      }
      const total = comIA + emAtendimento + encerrados;
      return { comIA, emAtendimento, encerrados, pessoas, total, porMes: [...meses].map(([label, total]) => ({ label, total })) };
    },
  });
  return (
    <Secao title="Atendimento" icon={Headphones}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Com a IA" value={data?.comIA ?? 0} icon={Bot} />
        <Kpi title="Em atendimento humano" value={data?.emAtendimento ?? 0} icon={Headphones} tone="warning" />
        <Kpi title="Encerrados" value={data?.encerrados ?? 0} icon={CheckCircle2} tone="success" />
        <Kpi title="Contatos" value={data?.pessoas ?? 0} icon={Users} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Atendimentos por mês</CardTitle></CardHeader>
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
  const { usuario } = useAuth();
  const projetos = usePagePermissions("/projetos").canRead;
  const cotacoes = usePagePermissions("/cotacoes").canRead;
  const ofertas = usePagePermissions("/orcamentos").canRead;
  const atend = usePagePermissions("/atendimentos").canRead;
  const nome = String(usuario?.["nome"] ?? "").split(" ")[0];
  const hora = new Date().getHours();
  const saud = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{saud}{nome ? `, ${nome}` : ""}</h1>
          <p className="text-sm text-muted-foreground">Painéis das áreas que você acessa.</p>
        </div>
        {ofertas && (
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mes">Mês atual</SelectItem>
              <SelectItem value="ano">Últimos 12 meses</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
      <MeuTrabalho />
      {projetos && <PainelProjetos />}
      {ofertas && <PainelComercial periodo={periodo} />}
      {cotacoes && <PainelCompras />}
      {atend && <PainelAtendimento />}
    </div>
  );
}
