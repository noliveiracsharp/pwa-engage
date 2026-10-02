import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { C, fmtDate, isDone, prioridadeClass, progressoCor, tarefaPct } from "@/lib/projetos";
import { pick, type Row } from "@/lib/row";

export const Route = createFileRoute("/compartilhado/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Cronograma do projeto — Atende.ai" },
      { name: "description", content: "Acompanhe o andamento e o cronograma do seu projeto." },
      { property: "og:title", content: "Cronograma do projeto — Atende.ai" },
      { property: "og:description", content: "Acompanhe o andamento e o cronograma do seu projeto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Compartilhado,
});

const DAY = 86_400_000;
const toTime = (v: unknown) => (v ? new Date(String(v).slice(0, 10) + "T00:00:00").getTime() : NaN);

function Compartilhado() {
  const { token } = Route.useParams();
  const [projeto, setProjeto] = useState<Row | null>(null);
  const [tarefas, setTarefas] = useState<Row[]>([]);
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");

  useEffect(() => {
    (async () => {
      const { data: p } = await supabase.from("projetos").select("*").eq("token_compartilhamento", token).maybeSingle();
      if (!p) { setEstado("erro"); return; }
      const proj = p as Row;
      const pid = pick(proj, ["id", "projeto_id"]);
      const col = C.tarefa.projeto[0]!;
      const { data: t } = await supabase.from("projetos_tarefas").select("*").eq(col, pid as never);
      setProjeto(proj); setTarefas((t ?? []) as Row[]); setEstado("ok");
    })();
  }, [token]);

  const g = useMemo(() => {
    const first = (r: Row, c: string[]) => pick(r, c);
    const lista = tarefas.map((t) => ({
      nome: String(first(t, C.tarefa.nome) ?? "Tarefa"),
      ini: toTime(first(t, C.tarefa.dtInicio)),
      fim: toTime(first(t, C.tarefa.dtFim)),
      iniRaw: first(t, C.tarefa.dtInicio), fimRaw: first(t, C.tarefa.dtFim),
      prio: first(t, C.tarefa.prioridade),
      pct: tarefaPct(t),
      done: tarefaPct(t) >= 100 || isDone(first(t, C.tarefa.concluida)),
    })).sort((a, b) => (a.ini || Infinity) - (b.ini || Infinity));
    const ts = lista.flatMap((x) => [x.ini, x.fim]).filter((n) => !isNaN(n));
    const min = ts.length ? Math.min(...ts) : 0;
    const max = ts.length ? Math.max(...ts) + DAY : 1;
    const ok = lista.filter((x) => x.done).length;
    const soma = lista.reduce((a, x) => a + (x.done ? 100 : x.pct), 0);
    return { lista, min, span: Math.max(max - min, DAY), ok, pct: lista.length ? Math.round(soma / lista.length) : 0 };
  }, [tarefas]);

  if (estado === "carregando") return <div className="grid min-h-dvh place-items-center text-muted-foreground">Carregando…</div>;
  if (estado === "erro" || !projeto) return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div><h1 className="text-xl font-semibold text-foreground">Link inválido</h1><p className="text-muted-foreground">Este projeto não foi encontrado ou o link expirou.</p></div>
    </div>
  );

  const nome = String(pick(projeto, C.projeto.nome) ?? "Projeto");
  const hoje = Date.now();
  const hojePct = ((hoje - g.min) / g.span) * 100;

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-6xl p-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Cronograma do projeto</p>
          <h1 className="text-2xl font-bold text-foreground">{nome}</h1>
          <p className="text-sm text-muted-foreground">{fmtDate(pick(projeto, C.projeto.dtInicio))} a {fmtDate(pick(projeto, C.projeto.dtFim))}</p>
          <div className="mt-4 flex items-center gap-3">
            <Progress value={g.pct} className="h-2 max-w-md" />
            <span className="text-sm text-muted-foreground">{g.ok}/{g.lista.length} tarefas · {g.pct}%</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 p-6">
        {g.lista.length === 0 && <p className="text-muted-foreground">Nenhuma tarefa cadastrada ainda.</p>}
        {g.lista.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <div className="min-w-[720px]">
              {g.lista.map((t, i) => {
                const temData = !isNaN(t.ini) || !isNaN(t.fim);
                const a = isNaN(t.ini) ? t.fim : t.ini;
                const b = (isNaN(t.fim) ? t.ini : t.fim) + DAY;
                const left = ((a - g.min) / g.span) * 100;
                const width = Math.max(((b - a) / g.span) * 100, 1.5);
                return (
                  <div key={i} className="grid grid-cols-[260px_1fr] items-center border-b border-border last:border-0">
                    <div className="flex items-center gap-2 p-3 text-sm">
                      {t.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      <div className="min-w-0">
                        <p className={`truncate font-medium ${t.done ? "text-muted-foreground line-through" : "text-foreground"}`}>{t.nome}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(t.iniRaw)} – {fmtDate(t.fimRaw)}</p>
                      </div>
                      {t.prio ? <Badge className={`ml-auto ${prioridadeClass(t.prio)}`}>{String(t.prio)}</Badge> : null}
                    </div>
                    <div className="relative h-12 border-l border-border">
                      {hojePct >= 0 && hojePct <= 100 && <div className="absolute inset-y-0 w-px bg-destructive/60" style={{ left: `${hojePct}%` }} />}
                      {temData && (
                        <div className="absolute top-1/2 h-5 -translate-y-1/2 overflow-hidden rounded bg-muted" style={{ left: `${left}%`, width: `${width}%` }} title={`${t.done ? 100 : t.pct}%${t.prio ? ` · ${String(t.prio)}` : ""}`}>
                          <div className="h-full" style={{ width: `${t.done ? 100 : t.pct}%`, backgroundColor: progressoCor(t.done ? 100 : t.pct) }} />
                          {t.prio ? <div className={`absolute inset-y-0 left-0 w-1.5 ${prioridadeClass(t.prio)}`} /> : null}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">A linha vermelha marca o dia de hoje. Página somente para consulta.</p>
      </main>
    </div>
  );
}
