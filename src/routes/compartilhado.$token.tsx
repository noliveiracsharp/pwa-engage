import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Circle, MessageSquare, Paperclip, Printer, Send } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { iniciais } from "@/components/projetos/ResponsaveisPicker";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { atividadePct, C, fmtDate, isDone, periodo, prioridadeClass, progressoCor, tarefaPct } from "@/lib/projetos";
import { pick, type Row } from "@/lib/row";
import { LegendaBlocos } from "@/components/projetos/LegendaCores";

export const Route = createFileRoute("/compartilhado/$token")({
  staticData: { sitemap: false },
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
const one = (v: unknown): Row | undefined => (Array.isArray(v) ? (v[0] as Row) : (v as Row) ?? undefined);

/** Tenta selects com join; se o relacionamento não existir, cai para "*". */
async function trySelect(table: string, selects: string[], apply: (q: any) => any): Promise<Row[]> {
  for (const s of selects) {
    const { data, error } = await apply(supabase.from(table).select(s));
    if (!error) return (data ?? []) as Row[];
  }
  return [];
}

function Compartilhado() {
  const { token } = Route.useParams();
  const [projeto, setProjeto] = useState<Row | null>(null);
  const [empresa, setEmpresa] = useState<Row | null>(null);
  const [tarefas, setTarefas] = useState<Row[]>([]);
  const [extra, setExtra] = useState<Extra>({ gestor: "", atividades: [], comentarios: {} });
  const [pessoas, setPessoas] = useState<Map<string, { nome: string; departamento: string }>>(new Map());
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");

  async function carregarDetalhes() {
    const { data: det } = await supabase.rpc("compartilhado_detalhes" as never, { p_token: token } as never);
    const dj = (det ?? {}) as Row;
    const gj = dj["gestor"] as Row | null | undefined;
    setExtra({
      gestor: gj ? String(gj["nome"] ?? "") : "",
      atividades: Array.isArray(dj["atividades"]) ? (dj["atividades"] as Row[]) : [],
      comentarios: (dj["comentarios"] && typeof dj["comentarios"] === "object" ? dj["comentarios"] : {}) as Record<string, Row[]>,
    });
  }
  const recarregar = () => { void carregarDetalhes(); };

  useEffect(() => {
    (async () => {
      const ps = await trySelect("projetos", ["*, empresas(*)", "*"], (q) => q.eq("token_compartilhamento", token).limit(1));
      const proj = ps[0];
      if (!proj) { setEstado("erro"); return; }
      let emp = one(proj["empresas"]);
      if (!emp && proj["empresa_id"]) {
        const { data } = await supabase.from("empresas").select("*").eq("id", proj["empresa_id"] as never).maybeSingle();
        emp = (data as Row) ?? undefined;
      }
      const pid = pick(proj, ["id", "projeto_id"]);
      const col = C.tarefa.projeto[0]!;
      const t = await trySelect(
        "projetos_tarefas",
        ["*, usuarios(nome)", "*"],
        (q) => q.eq(col, pid as never).order("ordem", { ascending: true }),
      );
      const { data: rs } = await supabase.rpc("compartilhado_responsaveis" as never, { p_token: token } as never);
      const mapa = new Map<string, { nome: string; departamento: string }>();
      for (const r of ((rs ?? []) as Row[])) mapa.set(String(r["id"]), { nome: String(r["nome"] ?? ""), departamento: String(r["departamento"] ?? "") });
      setPessoas(mapa);
      await carregarDetalhes();
      setProjeto(proj); setEmpresa(emp ?? null); setTarefas(t); setEstado("ok");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const g = useMemo(() => {
    const first = (r: Row, c: string[]) => pick(r, c);
    const lista = tarefas.map((t) => {
      const pct = tarefaPct(t);
      const resp = one(t["usuarios"]);
      const tid = String(pick(t, ["id"]));
      const subs = extra.atividades.filter((a) => String(a["tarefa_id"]) === tid).map((a) => ({
        nome: String(a["nome"] ?? ""),
        resps: (Array.isArray(a["responsaveis"]) ? (a["responsaveis"] as unknown[]) : []).map((n) => ({ nome: String(n ?? ""), departamento: "" })),
        ini: toTime(a["dt_inicio"]), fim: toTime(a["dt_fim"]), iniRaw: a["dt_inicio"], fimRaw: a["dt_fim"],
        prio: a["prioridade"], pct: atividadePct(a), done: atividadePct(a) >= 100,
        check: Number(a["check_total"] ?? 0) > 0 ? `${Number(a["check_ok"] ?? 0)}/${Number(a["check_total"])}` : "",
        sub: true as boolean,
      }));
      return {
        sub: false as boolean, check: "", subs,
        nome: String(first(t, C.tarefa.nome) ?? "Tarefa"),
        resps: (Array.isArray(t["responsaveis"]) && (t["responsaveis"] as unknown[]).length
          ? (t["responsaveis"] as unknown[]).map((id) => pessoas.get(String(id))).filter((x): x is { nome: string; departamento: string } => Boolean(x))
          : resp ? [{ nome: String(resp["nome"] ?? ""), departamento: "" }] : []),
        ini: toTime(first(t, C.tarefa.dtInicio)),
        fim: toTime(first(t, C.tarefa.dtFim)),
        iniRaw: first(t, C.tarefa.dtInicio), fimRaw: first(t, C.tarefa.dtFim),
        prio: first(t, C.tarefa.prioridade),
        pct,
        done: pct >= 100 || isDone(first(t, C.tarefa.concluida)),
      };
    });
    const linhas = lista.flatMap((x) => [x, ...x.subs]);
    const ts = linhas.flatMap((x) => [x.ini, x.fim]).filter((n) => !isNaN(n));
    const min = ts.length ? Math.min(...ts) : 0;
    const max = ts.length ? Math.max(...ts) + DAY : 1;
    const span = Math.max(max - min, DAY);
    // marcas da régua: ~8 divisões
    const marcas: number[] = [];
    if (ts.length) {
      const passo = Math.max(DAY, Math.ceil(span / 8 / DAY) * DAY);
      for (let x = min; x <= max; x += passo) marcas.push(x);
    }
    const ok = lista.filter((x) => x.done).length;
    const soma = lista.reduce((a, x) => a + (x.done ? 100 : x.pct), 0);
    return { lista, linhas, min, span, marcas, ok, pct: lista.length ? Math.round(soma / lista.length) : 0 };
  }, [tarefas, pessoas, extra]);

  if (estado === "carregando") return <div className="grid min-h-dvh place-items-center text-muted-foreground">Carregando…</div>;
  if (estado === "erro" || !projeto) return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div><h1 className="text-xl font-semibold text-foreground">Link inválido</h1><p className="text-muted-foreground">Este projeto não foi encontrado ou o link expirou.</p></div>
    </div>
  );

  const nome = String(pick(projeto, C.projeto.nome) ?? "Projeto");
  const per = periodo(pick(projeto, C.projeto.dtInicio), pick(projeto, C.projeto.dtFim));
  const empNome = empresa ? String(pick(empresa, ["nome_fantasia", "razao_social", "nome"]) ?? "") : "";
  const logo = empresa ? (pick(empresa, ["logo", "logo_url", "logotipo", "imagem"]) as string | undefined) : undefined;
  const hojePct = ((Date.now() - g.min) / g.span) * 100;
  const pos = (t: number) => ((t - g.min) / g.span) * 100;

  return (
    <div className="cmp-print min-h-dvh bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl p-6">
          {(empNome || logo) && (
            <div className="mb-5 flex items-center gap-3 border-b border-border pb-4">
              {logo ? <img src={logo} alt={empNome} className="h-12 w-auto max-w-[160px] object-contain" /> : null}
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Projeto conduzido por</p>
                <p className="text-lg font-semibold text-foreground">{empNome}</p>
              </div>
            </div>
          )}
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Cronograma do projeto</p>
            <Button size="sm" variant="outline" className="print:hidden" onClick={() => window.print()}>
              <Printer className="mr-1 h-4 w-4" /> Imprimir / Exportar PDF
            </Button>
          </div>
          <h1 className="text-2xl font-bold text-foreground">{nome}</h1>
          {per && <p className="text-sm text-muted-foreground">{per}</p>}
          {extra.gestor && <p className="text-sm text-muted-foreground">Gestor do projeto: <span className="font-medium text-foreground">{extra.gestor}</span></p>}
          <div className="mt-4 flex items-center gap-3">
            <Progress value={g.pct} className="h-2 max-w-md" />
            <span className="text-sm text-muted-foreground">{g.ok}/{g.lista.length} tarefas · {g.pct}%</span>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-4 p-6">
        {g.lista.length === 0 && <p className="text-muted-foreground">Nenhuma tarefa cadastrada ainda.</p>}
        {g.lista.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <div className="min-w-[960px]">
              <div className="grid grid-cols-[340px_1fr] border-b border-border bg-muted/40 text-xs text-muted-foreground">
                <div className="p-3 font-medium">Tarefa / Atividade</div>
                <div className="relative h-10 border-l border-border">
                  {g.marcas.map((m) => (
                    <span key={m} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap" style={{ left: `${pos(m)}%` }}>{fmtDate(new Date(m).toISOString()).slice(0, 5)}</span>
                  ))}
                </div>
              </div>
              {g.linhas.map((t, i) => {
                const temData = !isNaN(t.ini) || !isNaN(t.fim);
                const a = isNaN(t.ini) ? t.fim : t.ini;
                const b = (isNaN(t.fim) ? t.ini : t.fim) + DAY;
                const left = pos(a);
                const width = Math.max(((b - a) / g.span) * 100, 2);
                const pct = t.done ? 100 : t.pct;
                const labelDentro = width > 18;
                return (
                  <div key={i} className="grid grid-cols-[340px_1fr] items-stretch border-b border-border last:border-0">
                    <div className={`flex items-start gap-2 p-3 text-sm ${t.sub ? "bg-muted/20 pl-8" : ""}`}>
                      {t.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                      <div className="min-w-0 flex-1">
                        <p className={`break-words leading-snug ${t.sub ? "" : "font-medium"} ${t.done ? "" : "text-foreground"}`} style={t.done ? { color: "var(--progress-100)" } : undefined}>{t.sub ? "↳ " : ""}{t.nome}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {t.resps.map((r, k) => (
                            <span key={k} className="flex items-center gap-1" title={r.nome}>
                              <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">{iniciais(r.nome)}</span>
                              {r.departamento && <span>{r.departamento}</span>}
                            </span>
                          ))}
                          {t.check ? <span>Checklist {t.check}</span> : null}
                          {t.prio ? <Badge className={`h-5 px-1.5 text-[10px] ${prioridadeClass(t.prio)}`}>{String(t.prio)}</Badge> : null}
                        </div>
                      </div>
                    </div>
                    <div className="relative min-h-16 border-l border-border">
                      {g.marcas.map((m) => <div key={m} className="absolute inset-y-0 w-px bg-border/60" style={{ left: `${pos(m)}%` }} />)}
                      {hojePct >= 0 && hojePct <= 100 && <div className="absolute inset-y-0 z-10 w-0.5 bg-destructive/70" style={{ left: `${hojePct}%` }} />}
                      {temData && (
                        <div className="absolute top-1/2 flex -translate-y-1/2 items-center" style={{ left: `${left}%`, width: `${width}%` }}>
                          <div className="relative h-8 w-full overflow-hidden rounded-md border border-border bg-muted shadow-sm" title={`${t.nome} · ${fmtDate(t.iniRaw)} – ${fmtDate(t.fimRaw)} · ${pct}%`}>
                            <div className="h-full" style={{ width: `${pct}%`, backgroundColor: progressoCor(pct) }} />
                            {t.prio ? <div className={`absolute inset-y-0 left-0 w-1.5 ${prioridadeClass(t.prio)}`} /> : null}
                            {labelDentro && (
                              <span className="absolute inset-0 flex items-center justify-between gap-2 px-3 text-xs font-medium text-foreground">
                                <span>{fmtDate(t.iniRaw).slice(0, 5)}</span><span>{pct}%</span><span>{fmtDate(t.fimRaw).slice(0, 5)}</span>
                              </span>
                            )}
                          </div>
                          {!labelDentro && (
                            <span className="absolute left-full ml-2 whitespace-nowrap text-xs text-muted-foreground">
                              {fmtDate(t.iniRaw).slice(0, 5)} – {fmtDate(t.fimRaw).slice(0, 5)} · {pct}%
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <DetalhesPublicos token={token} tarefas={tarefas} extra={extra} onRecarregar={recarregar} />
        <section className="rounded-lg border border-border bg-card p-4"><p className="mb-3 text-sm font-semibold text-foreground">Legenda</p><LegendaBlocos /></section>
        <p className="text-xs text-muted-foreground">A linha vermelha marca o dia de hoje. Página somente para consulta.</p>
      </main>
    </div>
  );
}

type Extra = { gestor: string; atividades: Row[]; comentarios: Record<string, Row[]> };

/** Textos e anexos das atividades + comentários do cliente nas tarefas marcadas como públicas. */
function DetalhesPublicos({ token, tarefas, extra, onRecarregar }: { token: string; tarefas: Row[]; extra: Extra; onRecarregar: () => void }) {
  const blocos = tarefas.map((t) => {
    const id = String(pick(t, ["id"]));
    const ativs = extra.atividades.filter((a) => String(a["tarefa_id"]) === id && (String(a["descricao"] ?? "").trim() || (Array.isArray(a["anexos"]) && (a["anexos"] as Row[]).length)));
    const comentarios = extra.comentarios[id];
    return { id, nome: String(pick(t, C.tarefa.nome) ?? "Tarefa"), ativs, comentarios, publica: Array.isArray(comentarios) };
  }).filter((b) => b.ativs.length || b.publica);
  if (!blocos.length) return null;
  return (
    <section className="space-y-3 print:hidden">
      <h2 className="text-lg font-semibold text-foreground">Detalhes das tarefas</h2>
      {blocos.map((b) => (
        <details key={b.id} className="rounded-lg border border-border bg-card p-4" open={b.publica}>
          <summary className="flex cursor-pointer items-center gap-2 font-medium text-foreground">
            <span className="flex-1">{b.nome}</span>
            {b.publica && <span className="flex items-center gap-1 text-xs text-muted-foreground"><MessageSquare className="h-3.5 w-3.5" />{b.comentarios!.length}</span>}
          </summary>
          <div className="mt-3 space-y-4">
            {b.ativs.map((a) => (
              <div key={String(a["id"])} className="rounded-md border border-border p-3">
                <p className="text-sm font-medium text-foreground">↳ {String(a["nome"] ?? "")}</p>
                {String(a["descricao"] ?? "").trim() && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{String(a["descricao"])}</p>}
                {Array.isArray(a["anexos"]) && (a["anexos"] as Row[]).length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {(a["anexos"] as Row[]).map((x, i) => (
                      <li key={i}>
                        <button className="flex items-center gap-2 text-sm text-primary hover:underline" onClick={() => abrirAnexo(String(x["path"] ?? ""))}>
                          <Paperclip className="h-3.5 w-3.5" />{String(x["nome"] ?? "arquivo")}
                          {x["tamanho"] ? <span className="text-xs text-muted-foreground">{(Number(x["tamanho"]) / 1024).toFixed(0)} KB</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {b.publica && <ComentarCliente token={token} tarefaId={b.id} comentarios={b.comentarios!} onEnviado={onRecarregar} />}
          </div>
        </details>
      ))}
    </section>
  );
}

async function abrirAnexo(path: string) {
  if (!path) return;
  const { data } = await supabase.storage.from("projetos").createSignedUrl(path, 300);
  const url = data?.signedUrl ?? supabase.storage.from("projetos").getPublicUrl(path).data.publicUrl;
  window.open(url, "_blank", "noopener");
}

function ComentarCliente({ token, tarefaId, comentarios, onEnviado }: { token: string; tarefaId: string; comentarios: Row[]; onEnviado: () => void }) {
  const [nome, setNome] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("cmp-nome") ?? "" : ""));
  const [txt, setTxt] = useState("");
  const [busy, setBusy] = useState(false);
  async function enviar() {
    if (!nome.trim() || !txt.trim()) { toast.error("Informe seu nome e o comentário."); return; }
    setBusy(true);
    const { error } = await supabase.rpc("compartilhado_comentar" as never, { p_token: token, p_tarefa_id: tarefaId, p_autor: nome.trim(), p_texto: txt.trim() } as never);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    localStorage.setItem("cmp-nome", nome.trim());
    setTxt(""); toast.success("Comentário enviado."); onEnviado();
  }
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-sm font-semibold text-foreground">Comentários</p>
      {comentarios.length === 0 && <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>}
      <ul className="space-y-2">
        {comentarios.map((c, i) => (
          <li key={i} className={`rounded-md border border-border p-2 text-sm ${c["origem"] === "cliente" ? "bg-muted/40" : ""}`}>
            <p className="mb-1 text-xs text-muted-foreground"><span className="font-medium text-foreground">{String(c["autor"] ?? "")}</span>{c["origem"] === "equipe" ? " · Equipe" : ""} · {new Date(String(c["data"])).toLocaleString("pt-BR")}</p>
            <p className="whitespace-pre-wrap break-words">{String(c["texto"] ?? "")}</p>
          </li>
        ))}
      </ul>
      <Input placeholder="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
      <Textarea rows={3} placeholder="Escreva seu comentário…" value={txt} onChange={(e) => setTxt(e.target.value)} maxLength={4000} />
      <div className="flex justify-end"><Button size="sm" disabled={busy} onClick={enviar}><Send className="mr-1 h-4 w-4" />{busy ? "Enviando…" : "Enviar comentário"}</Button></div>
    </div>
  );
}
