import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronLeft, ChevronRight, CheckCircle2, Circle, Inbox, MessageSquare, Printer, Video, X } from "lucide-react";
import { ReunioesPainel, linkReuniao, useReunioes } from "@/components/chat-interno/ReunioesPainel";
import { TarefaDetalhe, registrarEvento } from "@/components/chat-interno/TarefaDetalhe";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { tocarSom } from "@/lib/som-notificacao";
import { useAuth } from "@/hooks/useAuth";
import { useEmpresaAtiva } from "@/hooks/useEmpresaAtiva";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  calcularPerformance, diaDoItem, horas, inicioSemana, lerEventos, normalizarPrioridade, novasRemarcacoes, ordenar, somarDias, textoRemarcacao,
  type PlannerItem,
} from "@/lib/planner";

const hoje = () => new Date().toISOString().slice(0, 10);
const dataBR = (s: string) => { const [a, m, d] = s.slice(0, 10).split("-"); return `${d}/${m}/${a}`; };
const tb = (t: string) => supabase.from(t as never) as unknown as ReturnType<typeof supabase.from>;
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const COR_PRI = { alta: "bg-destructive", media: "bg-warning", baixa: "bg-muted-foreground/50" } as const;

function deTarefa(t: Row): PlannerItem {
  const st = String(t["status"]);
  return {
    id: String(t["id"]), origem: "tarefa", titulo: String(t["titulo"] ?? ""),
    prioridade: normalizarPrioridade(t["prioridade"]),
    estimativaMin: t["estimativa_min"] == null ? null : Number(t["estimativa_min"]),
    planejada: t["data_planejada"] ? String(t["data_planejada"]).slice(0, 10) : null,
    entrega: t["data_entrega"] ? String(t["data_entrega"]).slice(0, 10) : null,
    status: st === "concluida" ? "concluida" : st === "recusada" ? "recusada" : st === "aguardando" ? "aguardando" : "aberta",
    concluidoEm: t["concluido_em"] ? String(t["concluido_em"]) : null,
    remarcacoes: Number(t["remarcacoes"] ?? 0),
    comentarios: lerEventos(t["comentarios"]).filter((e) => e.tipo === "comentario").length,
    criadoPor: t["criado_por"] ? String(t["criado_por"]) : null,
    responsavel: t["responsavel_id"] ? String(t["responsavel_id"]) : null,
  };
}
const projetoIdDe = (t: Row) => t["projeto_id"] ?? t["projetos_id"] ?? null;
function deProjeto(t: Row, nomes: Map<string, string>): PlannerItem {
  const fim = t["dt_fim"] ? String(t["dt_fim"]).slice(0, 10) : null;
  const concl = String(t["situacao"]) === "Concluída";
  const pid = projetoIdDe(t);
  return {
    id: String(t["id"]), origem: "projeto", titulo: String(t["nome"] ?? ""),
    prioridade: normalizarPrioridade(t["prioridade"]), estimativaMin: null,
    planejada: null, entrega: fim, status: concl ? "concluida" : "aberta",
    concluidoEm: concl ? String(t["updated_at"] ?? "") : null, remarcacoes: 0,
    criadoPor: t["created_by"] ? String(t["created_by"]) : null,
    responsavel: t["responsavel_id"] ? String(t["responsavel_id"]) : null,
    projetoNome: pid ? nomes.get(String(pid)) ?? null : null,
  };
}

/** Itens do planner de um usuário: tarefas diretas aceitas + tarefas de projeto em que é responsável. */
export function usePlannerItens(usuarioId: string, autorId?: string) {
  const qc = useQueryClient();
  const key = ["planner", usuarioId];
  const q = useQuery({
    queryKey: key,
    enabled: !!usuarioId,
    queryFn: async () => {
      const [a, b] = await Promise.all([
        tb("tarefas_usuarios").select("*").eq("responsavel_id", usuarioId).limit(1000),
        tb("projetos_tarefas").select("*")
          .or(`responsavel_id.eq.${usuarioId},responsaveis.cs.{${usuarioId}}`).limit(1000),
      ]);
      if (a.error) throw a.error;
      const projRows = b.error ? [] : ((b.data ?? []) as Row[]);
      const ids = [...new Set(projRows.map(projetoIdDe).filter(Boolean).map(String))];
      const nomes = new Map<string, string>();
      if (ids.length) {
        const p = await tb("projetos").select("*").in("id", ids);
        for (const r of ((p.data ?? []) as Row[])) nomes.set(String(r["id"]), String(pick(r, ["nome", "titulo", "descricao"], "Projeto")));
      }
      const proj = projRows.map((t) => deProjeto(t, nomes));
      return [...((a.data ?? []) as Row[]).map(deTarefa), ...proj];
    },
  });
  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ["tarefas-usuarios"] });
  };
  const concluir = async (i: PlannerItem, feito: boolean) => {
    const r = i.origem === "tarefa"
      ? await tb("tarefas_usuarios").update({ status: feito ? "concluida" : "andamento", concluido_em: feito ? new Date().toISOString() : null } as never).eq("id", i.id)
      : await tb("projetos_tarefas").update({ situacao: feito ? "Concluída" : "Em andamento", progresso: feito ? 100 : 0 } as never).eq("id", i.id);
    if (r.error) { toast.error(r.error.message); return; }
    if (feito) tocarSom("equipe");
    if (i.origem === "tarefa" && autorId) await registrarEvento(i.id, autorId, feito ? "Tarefa concluída." : "Tarefa reaberta.");
    recarregar();
  };
  const planejar = async (i: PlannerItem, dia: string | null) => {
    if (i.origem === "projeto") { toast.info("Tarefas de projeto seguem o prazo definido no projeto."); return; }
    const r = await tb("tarefas_usuarios").update({ data_planejada: dia, remarcacoes: novasRemarcacoes(i.remarcacoes, i.planejada, dia) } as never).eq("id", i.id);
    if (r.error) { toast.error(r.error.message.includes("data_planejada") ? "Rode o script atendeai-planner.sql no banco." : r.error.message); return; }
    if (autorId && i.planejada !== dia) await registrarEvento(i.id, autorId, textoRemarcacao(i.planejada, dia));
    recarregar();
  };
  return { itens: q.data ?? [], isLoading: q.isLoading, concluir, planejar };
}

export function ItemLinha({ i, onCheck, compacto, editavel = true, onAbrir, nome }: { i: PlannerItem; onCheck: (feito: boolean) => void; compacto?: boolean; editavel?: boolean; onAbrir?: () => void; nome?: (id: string) => string }) {
  const feito = i.status === "concluida";
  const atraso = !feito && !!i.entrega && i.entrega < hoje();
  const proprio = !!i.criadoPor && i.criadoPor === i.responsavel;
  return (
    <div className={cn("flex items-start gap-2 rounded-lg border border-border bg-card p-2 text-xs", feito && "opacity-60")}>
      <button type="button" disabled={!editavel} aria-label={feito ? "Reabrir" : "Concluir"} onClick={() => onCheck(!feito)} className="mt-0.5 shrink-0">
        {feito ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
      </button>
      <div className="min-w-0 flex-1">
        {onAbrir && i.origem === "tarefa"
          ? <button type="button" onClick={onAbrir} className={cn("text-left font-medium leading-tight hover:underline", feito && "line-through")}>{i.titulo}</button>
          : <p className={cn("font-medium leading-tight", feito && "line-through")}>{i.titulo}</p>}
        {!compacto && nome && (i.criadoPor || i.responsavel) && (
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {proprio
              ? <>Lembrete pessoal de <b className="text-foreground">{nome(i.criadoPor!)}</b></>
              : <>
                  {i.criadoPor && <>De: <b className="text-foreground">{nome(i.criadoPor)}</b></>}
                  {i.criadoPor && i.responsavel && " → "}
                  {i.responsavel && <>Para: <b className="text-foreground">{nome(i.responsavel)}</b></>}
                </>}
          </p>
        )}
        {!compacto && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className={cn("h-1.5 w-1.5 rounded-full", COR_PRI[i.prioridade])} />{i.prioridade === "media" ? "Média" : i.prioridade === "alta" ? "Alta" : "Baixa"}</span>
            {i.origem === "projeto" && <span className="rounded bg-primary/10 px-1 text-primary">📁 {i.projetoNome ? `Projeto: ${i.projetoNome}` : "Projeto"}</span>}
            {i.origem === "tarefa" && <span className="rounded bg-muted px-1">Tarefa da equipe</span>}
            {i.estimativaMin ? <span>{horas(i.estimativaMin)}</span> : null}
            {i.entrega && <span className={cn(atraso && "font-semibold text-destructive")}>Prazo {dataBR(i.entrega)}</span>}
            {i.remarcacoes > 0 && <span>↻ {i.remarcacoes}</span>}
            {i.comentarios ? <span className="inline-flex items-center gap-0.5"><MessageSquare className="h-3 w-3" />{i.comentarios}</span> : null}
          </p>
        )}
      </div>
    </div>
  );
}

/** Planner completo em tela cheia: backlog + semana + performance + relatório. */
export function PlannerPainel({ me, empresaId, usuarios, onFechar }: { me: string; empresaId: string; usuarios: Row[]; onFechar: () => void }) {
  const { isMaster, usuario } = useAuth();
  const permUsuarios = usePagePermissions("/usuarios");
  const gestor = isMaster || permUsuarios.canUpdate;
  const emp = useEmpresaAtiva();
  const [alvo, setAlvo] = useState(me);
  const [semana, setSemana] = useState(inicioSemana(hoje()));
  const [desde, setDesde] = useState(somarDias(hoje(), -29));
  const [ate, setAte] = useState(hoje());
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [reunioesAberto, setReunioesAberto] = useState(false);
  const reunioes = useReunioes(empresaId).data ?? [];
  const { itens, concluir, planejar } = usePlannerItens(alvo, me);
  const proprio = alvo === me;
  const mapaNomes = useMemo(() => new Map(usuarios.map((u) => [String(u["id"]), String(pick(u, ["nome"], "Usuário"))])), [usuarios]);
  const nomeDe = (id: string) => (id === me ? "Você" : mapaNomes.get(id) ?? "Usuário");
  const ativos = itens.filter((i) => i.status === "aberta" || i.status === "concluida");
  const backlog = ordenar(ativos.filter((i) => !diaDoItem(i) && i.status !== "concluida"));
  const dias = DIAS.map((_, n) => somarDias(semana, n));
  const atrasadas = ativos.filter((i) => i.status !== "concluida" && (diaDoItem(i) ?? "9") < hoje());
  const perf = useMemo(() => calcularPerformance(itens, desde, ate), [itens, desde, ate]);
  const pessoas = useMemo(() => [...usuarios].sort((a, b) => String(pick(a, ["nome"], "")).localeCompare(String(pick(b, ["nome"], "")), "pt-BR")), [usuarios]);
  const nomeAlvo = proprio ? String(pick(usuario, ["nome"], "Você")) : String(pick(usuarios.find((u) => String(u["id"]) === alvo) ?? {}, ["nome"], "Usuário"));
  const detalhes = ordenar(itens.filter((i) => { const d = diaDoItem(i); return i.status !== "recusada" && i.status !== "aguardando" && d && d >= desde && d <= ate; }));
  const farol = perf.classificacao === "Excelente" ? "text-success" : perf.classificacao === "Bom" ? "text-warning" : "text-destructive";

  const soltar = (dia: string | null) => {
    const i = itens.find((x) => x.id === arrastando);
    setArrastando(null);
    if (i && proprio) void planejar(i, dia);
  };
  const coluna = (titulo: string, dia: string | null, lista: PlannerItem[]) => {
    const min = lista.reduce((s, i) => s + (i.estimativaMin ?? 0), 0);
    return (
      <div key={titulo} onDragOver={(e) => e.preventDefault()} onDrop={() => soltar(dia)}
        className={cn("flex min-h-40 flex-col rounded-xl border border-border bg-muted/40 p-2", dia === hoje() && "border-primary")}>
        <div className="mb-2 flex items-baseline justify-between text-xs">
          <b>{titulo}</b>
          <span className="text-muted-foreground">{lista.filter((i) => i.status === "concluida").length}/{lista.length}{min ? ` • ${horas(min)}` : ""}</span>
        </div>
        <div className="space-y-1.5">
          {dia && reunioes.filter((r) => !r.cancelada && (r.criado_por === alvo || r.participantes.includes(alvo)) && new Date(r.inicio).toLocaleDateString("sv-SE") === dia).map((r) => (
            <button key={r.id} type="button" onClick={() => window.open(`${linkReuniao(r)}${r.video ? "?" : "&"}org=${r.id}`, "_blank")}
              className="flex w-full items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 p-2 text-left text-xs hover:bg-primary/20">
              <Video className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1"><b className="block truncate">{r.titulo}</b>{new Date(r.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {r.duracao_min} min</span>
            </button>
          ))}
          {lista.map((i) => (
            <div key={i.id} draggable={proprio && i.origem === "tarefa"} onDragStart={() => setArrastando(i.id)} className={cn(proprio && i.origem === "tarefa" && "cursor-grab")}>
              <ItemLinha i={i} nome={nomeDe} editavel={proprio} onCheck={(f) => void concluir(i, f)} onAbrir={() => setAberta(i.id)} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="mr-auto text-lg font-semibold">Planner — {nomeAlvo}</h2>
        {gestor && (
          <Select value={alvo} onValueChange={setAlvo}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[80]">
              <SelectItem value={me}>Meu planner</SelectItem>
              {pessoas.map((u) => <SelectItem key={String(u["id"])} value={String(u["id"])}>{String(pick(u, ["nome"], "Usuário"))}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {proprio && atrasadas.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => void Promise.all(atrasadas.filter((i) => i.origem === "tarefa").map((i) => planejar(i, hoje())))}>
            Trazer {atrasadas.length} pendência(s) para hoje
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setReunioesAberto(true)}><CalendarClock className="mr-1 h-4 w-4" /> Reuniões</Button>
        <Button size="sm" variant="ghost" aria-label="Fechar planner" onClick={onFechar}><X className="h-5 w-5" /></Button>
      </div>
      {reunioesAberto && <ReunioesPainel me={me} empresaId={empresaId} usuarios={usuarios} onFechar={() => setReunioesAberto(false)} />}
      <TarefaDetalhe id={aberta} me={me} usuarios={usuarios} onFechar={() => setAberta(null)} />

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mb-3 flex items-center gap-2">
          <Button size="icon" variant="outline" aria-label="Semana anterior" onClick={() => setSemana(somarDias(semana, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={() => setSemana(inicioSemana(hoje()))}>Esta semana</Button>
          <Button size="icon" variant="outline" aria-label="Próxima semana" onClick={() => setSemana(somarDias(semana, 7))}><ChevronRight className="h-4 w-4" /></Button>
          <span className="text-sm text-muted-foreground">{dataBR(dias[0]!)} a {dataBR(dias[5]!)}</span>
          {proprio && <span className="ml-auto text-xs text-muted-foreground">Arraste as tarefas entre o backlog e os dias.</span>}
        </div>
        <div className="grid gap-2 md:grid-cols-[220px_repeat(6,minmax(0,1fr))]">
          <div onDragOver={(e) => e.preventDefault()} onDrop={() => soltar(null)} className="rounded-xl border border-dashed border-border p-2">
            <div className="mb-2 flex items-center gap-1 text-xs font-bold"><Inbox className="h-3.5 w-3.5" /> Backlog ({backlog.length})</div>
            <div className="space-y-1.5">
              {backlog.map((i) => (
                <div key={i.id} draggable={proprio && i.origem === "tarefa"} onDragStart={() => setArrastando(i.id)}>
                  <ItemLinha i={i} nome={nomeDe} editavel={proprio} onCheck={(f) => void concluir(i, f)} onAbrir={() => setAberta(i.id)} />
                </div>
              ))}
            </div>
          </div>
          {dias.map((d, n) => coluna(`${DIAS[n]} ${d.slice(8, 10)}/${d.slice(5, 7)}`, d, ordenar(ativos.filter((i) => diaDoItem(i) === d))))}
        </div>

        <section className="mt-6 rounded-xl border border-border p-4">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <h3 className="mr-auto font-semibold">Performance</h3>
            <div className="space-y-1"><Label className="text-xs">De</Label><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
            <Button size="sm" onClick={imprimirPlanner}><Printer className="mr-1 h-4 w-4" /> Relatório</Button>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ["Score de produtividade", `${perf.score}`, perf.classificacao],
              ["Aderência", `${perf.aderencia}%`, `${perf.concluidas} de ${perf.planejadas} planejadas`],
              ["Pontualidade", `${perf.pontualidade}%`, `${perf.noPrazo} de ${perf.comPrazo} com prazo`],
              ["Remarcações", `${perf.remarcacoes}`, "dias alterados"],
              ["Horas entregues", horas(perf.minutosConcluidos), "pela estimativa"],
            ].map(([t, v, s], n) => (
              <div key={t} className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">{t}</p>
                <p className={cn("text-2xl font-bold", n === 0 && farol)}>{v}</p>
                <p className="text-[11px] text-muted-foreground">{s}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="dre-print-src" aria-hidden>
        <div id="planner-print" className="dre-doc">
          <header className="dre-head">
            <div className="dre-emp">
              {emp.logo && <img src={String(emp.logo)} alt="" data-no-zoom />}
              <div><div className="dre-emp-nome">{emp.nome}</div><div className="dre-rot">Relatório de produtividade • Confidencial</div></div>
            </div>
            <div className="dre-head-dir"><div className="dre-rot">Emitido em</div><div>{new Date().toLocaleString("pt-BR")}</div></div>
          </header>
          <div className="dre-titulo"><h1>Performance do colaborador — {nomeAlvo}</h1><p>Período de {dataBR(desde)} a {dataBR(ate)} • Classificação: {perf.classificacao}</p></div>
          <table className="dre-kpis"><tbody><tr>
            <td className="dre-kpi-res"><span>Score</span><strong>{perf.score}</strong><small>{perf.classificacao}</small></td>
            <td><span>Aderência</span><strong>{perf.aderencia}%</strong><small>{perf.concluidas}/{perf.planejadas}</small></td>
            <td><span>Pontualidade</span><strong>{perf.pontualidade}%</strong><small>{perf.noPrazo}/{perf.comPrazo}</small></td>
            <td><span>Remarcações</span><strong>{perf.remarcacoes}</strong></td>
            <td><span>Horas entregues</span><strong>{horas(perf.minutosConcluidos)}</strong></td>
          </tr></tbody></table>
          <h2>Detalhamento das tarefas</h2>
          <table className="dre-tab">
            <thead><tr><th>Tarefa</th><th>Origem</th><th>Prioridade</th><th>Dia</th><th>Prazo</th><th>Concluída em</th><th className="num">Remarc.</th><th>Situação</th></tr></thead>
            <tbody>{detalhes.map((i) => (
              <tr key={i.id}>
                <td>{i.titulo}</td><td>{i.origem === "projeto" ? "Projeto" : "Tarefa"}</td>
                <td>{i.prioridade === "media" ? "Média" : i.prioridade === "alta" ? "Alta" : "Baixa"}</td>
                <td>{diaDoItem(i) ? dataBR(diaDoItem(i)!) : "—"}</td><td>{i.entrega ? dataBR(i.entrega) : "—"}</td>
                <td>{i.concluidoEm ? dataBR(i.concluidoEm) : "—"}</td><td className="num">{i.remarcacoes}</td>
                <td>{i.status === "concluida" ? "Concluída" : (i.entrega ?? "9") < hoje() ? "Atrasada" : "Em aberto"}</td>
              </tr>
            ))}</tbody>
            <tfoot><tr><td colSpan={6}>Total: {detalhes.length} tarefas</td><td className="num">{perf.remarcacoes}</td><td>{perf.concluidas} concluídas</td></tr></tfoot>
          </table>
          <footer className="dre-rodape">Score = 50% aderência + 35% pontualidade + 15% disciplina (menos remarcações). Excelente ≥ 90, Bom ≥ 75, Atenção abaixo. Documento de uso interno.</footer>
        </div>
      </div>
    </div>
  );
}

function imprimirPlanner() {
  const src = document.getElementById("planner-print");
  if (!src) return;
  const host = document.createElement("div");
  host.className = "dre-print-host";
  host.appendChild(src.cloneNode(true));
  document.body.appendChild(host);
  document.documentElement.classList.add("dre-printing");
  const limpar = () => { document.documentElement.classList.remove("dre-printing"); host.remove(); window.removeEventListener("afterprint", limpar); };
  window.addEventListener("afterprint", limpar);
  const imgs = Array.from(host.querySelectorAll("img"));
  Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })))).then(() => setTimeout(() => window.print(), 50));
}
