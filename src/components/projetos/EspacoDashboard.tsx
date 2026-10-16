import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Clock, CheckCircle2, AlertTriangle, ListTodo, FolderKanban, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getIcon } from "@/components/layout/icon-map";
import { rowId } from "@/lib/crud";
import { tarefaPct } from "@/lib/projetos";
import { pick, type Row } from "@/lib/row";
import { espacoEDescendentes } from "./EspacosSidebar";

type Props = {
  espaco: Row;
  espacos: Row[];
  projetos: Row[];
  tarefas: Row[];
  status: Row[];
  pc: { status: string; ini: string; fim: string };
  tc: { projeto: string; done: string };
  onAcessar: (id: string) => void;
};

const EST = ["horas_estimadas", "estimativa_horas"];
const APT = ["horas_apontadas", "horas_trabalhadas", "horas_gastas", "horas_realizadas"];
const num = (r: Row, k: string[]) => Number(pick(r, k, 0)) || 0;
const fmtH = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;

const TIPOS = [
  { key: "a_fazer", label: "A fazer", cor: "var(--progress-0)" },
  { key: "progresso", label: "Em progresso", cor: "var(--progress-50)" },
  { key: "concluido", label: "Concluído", cor: "var(--progress-100)" },
  { key: "erro", label: "Erro", cor: "var(--destructive)" },
] as const;

function inicioPeriodo(p: string): Date {
  const h = new Date();
  if (p === "mes") return new Date(h.getFullYear(), h.getMonth(), 1);
  if (p === "tri") return new Date(h.getFullYear(), Math.floor(h.getMonth() / 3) * 3, 1);
  return new Date(h.getFullYear(), 0, 1);
}

export function EspacoDashboard({ espaco, espacos, projetos, tarefas, status, pc, tc, onAcessar }: Props) {
  const [periodo, setPeriodo] = useState("ano");
  const [incluirConcluidos, setIncluirConcluidos] = useState(true);
  const espId = String(rowId(espaco));
  const Icon = getIcon(String(espaco["icone"] ?? "") || "Folder");

  const dados = useMemo(() => {
    const filhos = espacos.filter((e) => String(e["espaco_pai_id"] ?? "") === espId);
    const desde = inicioPeriodo(periodo);
    const hoje = new Date().toISOString().slice(0, 10);
    const tipoStatus = new Map(status.map((s) => [String(rowId(s)), String(s["tipo"] ?? "")]));
    const tarefasDe = (pid: string) => tarefas.filter((t) => String(t[tc.projeto]) === pid);
    const pctProj = (pid: string) => {
      const ts = tarefasDe(pid);
      return ts.length ? ts.reduce((a, t) => a + tarefaPct(t, tc.done), 0) / ts.length : 0;
    };
    const projDone = (p: Row) => tipoStatus.get(String(p[pc.status] ?? "")) === "concluido" || pctProj(String(rowId(p))) >= 100;

    const porFilho = filhos.map((f) => {
      const ids = espacoEDescendentes(espacos, String(rowId(f)));
      const ps = projetos.filter((p) => {
        if (!ids.has(String(p["espaco_id"] ?? ""))) return false;
        const dt = String(pick(p, [pc.ini, "created_at", "dt_cadastro"]) ?? "");
        if (dt && new Date(dt) < desde) return false;
        if (!incluirConcluidos && projDone(p)) return false;
        return true;
      });
      const ts = [
        ...ps.flatMap((p) => tarefasDe(String(rowId(p))).map((t) => ({ t, sid: String(p[pc.status] ?? "") }))),
        ...tarefas.filter((t) => !t[tc.projeto] && ids.has(String(t["espaco_id"] ?? ""))).map((t) => ({ t, sid: String(t["status_id"] ?? "") })),
      ];
      return { f, ps, ts };
    });

    let est = 0, apt = 0, ativos = 0, atraso = 0, noPrazo = 0;
    const pizza: Record<string, number> = { a_fazer: 0, progresso: 0, concluido: 0, erro: 0 };
    const barras = porFilho.map(({ f, ps, ts }) => {
      let e = 0, a = 0;
      for (const { t, sid } of ts) {
        e += num(t, EST); a += num(t, APT);
        const pct = tarefaPct(t, tc.done);
        const tipo = tipoStatus.get(sid);
        if (!t[tc.projeto]) {
          const fim = String(t["dt_fim"] ?? t["data_fim"] ?? "").slice(0, 10);
          if (pct >= 100 || tipo === "concluido") noPrazo++; else if (fim && fim < hoje) atraso++; else ativos++;
        }
        pizza[pct >= 100 ? "concluido" : tipo === "erro" ? "erro" : pct > 0 ? "progresso" : "a_fazer"]! += 1;
      }
      for (const p of ps) {
        const fim = String(p[pc.fim] ?? "").slice(0, 10);
        if (projDone(p)) noPrazo++;
        else if (fim && fim < hoje) atraso++;
        else ativos++;
      }
      est += e; apt += a;
      return { nome: String(f["nome"] ?? ""), Estimadas: Math.round(e * 10) / 10, Trabalhadas: Math.round(a * 10) / 10 };
    });

    const cards = porFilho.map(({ f, ps, ts }) => ({
      f,
      projetos: ps.length,
      tarefas: ts.length,
      horas: ts.reduce((s, { t }) => s + num(t, APT), 0),
      pct: ts.length ? Math.round((ts.filter(({ t }) => tarefaPct(t, tc.done) >= 100).length / ts.length) * 100) : 0,
    }));
    const totalTarefas = porFilho.reduce((s, x) => s + x.ts.length, 0);
    return { est, apt, ativos, atraso, noPrazo, pizza, barras, cards, totalTarefas };
  }, [espacos, espId, periodo, incluirConcluidos, projetos, tarefas, status, pc, tc]);

  const consumo = dados.est ? Math.round((dados.apt / dados.est) * 100) : 0;
  const pizza = TIPOS.map((t) => ({ name: t.label, value: dados.pizza[t.key] ?? 0, cor: t.cor })).filter((x) => x.value > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Icon className="h-6 w-6" style={{ color: String(espaco["cor"] ?? "") || undefined }} />
          {String(espaco["nome"] ?? "")}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mes">Mês atual</SelectItem>
              <SelectItem value="tri">Trimestre</SelectItem>
              <SelectItem value="ano">Ano</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Checkbox id="inc-conc" checked={incluirConcluidos} onCheckedChange={(v) => setIncluirConcluidos(v === true)} />
            <Label htmlFor="inc-conc">Incluir concluídos</Label>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" />Total de horas</div>
          <div className="mt-1 text-2xl font-bold">{fmtH(dados.apt)} <span className="text-base font-normal text-muted-foreground">/ {fmtH(dados.est)}</span></div>
          <Progress value={Math.min(consumo, 100)} className="mt-2" />
          <div className={`mt-1 text-xs ${consumo > 100 ? "text-destructive" : "text-muted-foreground"}`}>{consumo}% do tempo estimado consumido</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm text-muted-foreground">Saúde dos prazos</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div><FolderKanban className="mx-auto h-4 w-4 text-primary" /><div className="text-xl font-bold">{dados.ativos}</div><div className="text-xs text-muted-foreground">Ativos</div></div>
            <div><AlertTriangle className="mx-auto h-4 w-4 text-destructive" /><div className="text-xl font-bold">{dados.atraso}</div><div className="text-xs text-muted-foreground">Em atraso</div></div>
            <div><CheckCircle2 className="mx-auto h-4 w-4 text-success" /><div className="text-xl font-bold">{dados.noPrazo}</div><div className="text-xs text-muted-foreground">Concluídos</div></div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><ListTodo className="h-4 w-4" />Total de tarefas</div>
          <div className="mt-1 text-2xl font-bold">{dados.totalTarefas}</div>
          <div className="text-xs text-muted-foreground">em {dados.cards.length} subespaço(s)</div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Horas estimadas x trabalhadas</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={dados.barras}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="nome" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
                <Legend />
                <Bar dataKey="Estimadas" fill="var(--progress-25)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Trabalhadas" fill="var(--progress-50)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Tarefas por situação</h2>
          <div className="h-64">
            {pizza.length === 0 ? <p className="pt-20 text-center text-sm text-muted-foreground">Sem tarefas no período.</p> : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pizza} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {pizza.map((p) => <Cell key={p.name} fill={p.cor} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)" }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">Itens deste {rotuloTipo(espaco).toLowerCase()}</h2>
        {dados.cards.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Ainda não há itens aqui. Passe o mouse sobre o nome na lista à esquerda e clique em "+" para criar um Projeto, Pasta ou Lista.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {dados.cards.map(({ f, tarefas: nt, horas, pct }) => {
              const FI = getIcon(iconeEspaco(f));
              return (
                <div key={String(rowId(f))} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-2 font-semibold"><FI className="h-4 w-4" style={{ color: String(f["cor"] ?? "") || undefined }} />{String(f["nome"] ?? "")}<span className="ml-auto text-xs font-normal text-muted-foreground">{rotuloTipo(f)}</span></div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Tarefas concluídas</span><span>{pct}%</span></div>
                    <Progress value={pct} />
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground"><span>{fmtH(horas)} gastas</span><span>{nt} tarefa(s)</span></div>
                  <Button variant="outline" size="sm" onClick={() => onAcessar(String(rowId(f)))}>Abrir {rotuloTipo(f).toLowerCase()}<ArrowRight className="ml-1 h-4 w-4" /></Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
