import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, Clock, FolderKanban, ListTodo, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getIcon } from "@/components/layout/icon-map";
import { rowId } from "@/lib/crud";
import { tarefaPct } from "@/lib/projetos";
import { pick, type Row } from "@/lib/row";
import { espacoEDescendentes, iconeEspaco } from "./EspacosSidebar";

type Props = {
  espacos: Row[];
  projetos: Row[];
  tarefas: Row[];
  status: Row[];
  pc: { nome: string; status: string; fim: string };
  tc: { projeto: string; done: string };
  onAcessar: (id: string) => void;
  onAbrirProjeto: (id: string) => void;
};

const EST = ["horas_estimadas", "estimativa_horas"];
const APT = ["horas_apontadas", "horas_trabalhadas", "horas_gastas", "horas_realizadas"];
const num = (r: Row, k: string[]) => Number(pick(r, k, 0)) || 0;
const fmtH = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
const fimTarefa = (t: Row) => String(pick(t, ["data_fim", "prazo", "data_entrega", "vencimento"], "") ?? "").slice(0, 10);

export function DashboardGeral({ espacos, projetos, tarefas, status, pc, tc, onAcessar, onAbrirProjeto }: Props) {
  const d = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    const tipo = new Map(status.map((s) => [String(rowId(s)), String(s["tipo"] ?? "")]));
    const porProj = new Map<string, Row[]>();
    for (const t of tarefas) {
      const k = String(t[tc.projeto] ?? "");
      porProj.set(k, [...(porProj.get(k) ?? []), t]);
    }
    const pct = (pid: string) => {
      const ts = porProj.get(pid) ?? [];
      return ts.length ? ts.reduce((a, t) => a + tarefaPct(t, tc.done), 0) / ts.length : 0;
    };
    const info = projetos.map((p) => {
      const id = String(rowId(p));
      const concl = tipo.get(String(p[pc.status] ?? "")) === "concluido" || (pct(id) >= 100 && (porProj.get(id)?.length ?? 0) > 0);
      const fim = String(p[pc.fim] ?? "").slice(0, 10);
      const ts = porProj.get(id) ?? [];
      const atrasadas = ts.filter((t) => !t[tc.done] && fimTarefa(t) && fimTarefa(t) < hoje).length;
      const atrasado = !concl && ((!!fim && fim < hoje) || atrasadas > 0);
      return { p, id, concl, atrasado, atrasadas, fim, pct: pct(id) };
    });
    const ativos = info.filter((i) => !i.concl);
    const tarefasAbertas = tarefas.filter((t) => !t[tc.done]).length;
    const pctGeral = tarefas.length ? tarefas.reduce((a, t) => a + tarefaPct(t, tc.done), 0) / tarefas.length : 0;
    const est = tarefas.reduce((a, t) => a + num(t, EST), 0);
    const apt = tarefas.reduce((a, t) => a + num(t, APT), 0);
    const raizes = espacos.filter((e) => !e["espaco_pai_id"]);
    const porEspaco = raizes.map((e) => {
      const ids = new Set(espacoEDescendentes(espacos, String(rowId(e))));
      const ps = info.filter((i) => ids.has(String(i.p["espaco_id"] ?? "")));
      const media = ps.length ? ps.reduce((a, i) => a + i.pct, 0) / ps.length : 0;
      return { e, total: ps.length, atrasados: ps.filter((i) => i.atrasado).length, media };
    });
    const risco = info.filter((i) => i.atrasado).sort((a, b) => b.atrasadas - a.atrasadas || a.fim.localeCompare(b.fim)).slice(0, 8);
    return {
      total: info.length, ativos: ativos.length, noPrazo: ativos.filter((i) => !i.atrasado).length,
      atrasados: ativos.filter((i) => i.atrasado).length, concluidos: info.length - ativos.length,
      tarefasAbertas, pctGeral, est, apt, porEspaco, risco, hoje,
    };
  }, [espacos, projetos, tarefas, status, pc, tc]);

  const kpis = [
    { l: "Projetos ativos", v: d.ativos, s: `${d.total} no total`, I: FolderKanban, c: "text-primary" },
    { l: "No prazo", v: d.noPrazo, s: "Ativos sem atraso", I: CheckCircle2, c: "text-[color:var(--progress-100)]" },
    { l: "Em atraso", v: d.atrasados, s: "Prazo ou tarefas vencidas", I: AlertTriangle, c: "text-destructive" },
    { l: "Concluídos", v: d.concluidos, s: "Projetos finalizados", I: CheckCircle2, c: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Visão geral dos projetos</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.l} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">{k.l}<k.I className={`h-4 w-4 ${k.c}`} /></div>
            <div className="mt-1 text-3xl font-bold text-foreground">{k.v}</div>
            <div className="text-xs text-muted-foreground">{k.s}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground"><ListTodo className="h-4 w-4" />Saúde das entregas</div>
          <div className="mt-2 text-2xl font-bold text-foreground">{Math.round(d.pctGeral)}%</div>
          <Progress value={d.pctGeral} className="mt-2" />
          <div className="mt-2 text-xs text-muted-foreground">{d.tarefasAbertas} tarefas em aberto</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground"><Clock className="h-4 w-4" />Carga de horas</div>
          <div className="mt-2 text-2xl font-bold text-foreground">{fmtH(d.apt)} <span className="text-base font-normal text-muted-foreground">de {fmtH(d.est)} estimadas</span></div>
          <Progress value={d.est ? Math.min(100, (d.apt / d.est) * 100) : 0} className="mt-2" />
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 font-semibold text-foreground">Por espaço</h2>
          {d.porEspaco.length === 0 && <p className="text-sm text-muted-foreground">Nenhum espaço cadastrado.</p>}
          <div className="space-y-3">
            {d.porEspaco.map(({ e, total, atrasados, media }) => {
              const Icon = getIcon(iconeEspaco(e));
              return (
                <button key={String(rowId(e))} onClick={() => onAcessar(String(rowId(e)))} className="w-full rounded-md p-2 text-left hover:bg-muted">
                  <div className="flex items-center gap-2 text-sm">
                    <Icon className="h-4 w-4" /><span className="flex-1 font-medium text-foreground">{String(e["nome"] ?? "")}</span>
                    <span className="text-xs text-muted-foreground">{total} projetos{atrasados ? ` · ${atrasados} em atraso` : ""}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </div>
                  <Progress value={media} className="mt-1 h-1.5" />
                </button>
              );
            })}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-foreground"><AlertTriangle className="h-4 w-4 text-destructive" />Projetos em risco</h2>
          {d.risco.length === 0 && <p className="text-sm text-muted-foreground">Nenhum projeto em atraso. 🎉</p>}
          <div className="space-y-2">
            {d.risco.map((i) => (
              <div key={i.id} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground">{String(i.p[pc.nome] ?? "")}</div>
                  <div className="text-xs text-muted-foreground">
                    {i.fim && i.fim < d.hoje ? `Prazo ${i.fim.split("-").reverse().join("/")} vencido` : "No prazo"}
                    {i.atrasadas ? ` · ${i.atrasadas} tarefa(s) atrasada(s)` : ""} · {Math.round(i.pct)}%
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => onAbrirProjeto(i.id)}>Abrir</Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
