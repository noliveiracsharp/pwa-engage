import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ChevronLeft, ChevronRight, CheckCircle2, Circle, Inbox, MessageSquare, Printer, Video, X, LogIn, Copy, Pencil, Ban } from "lucide-react";
import { ReunioesPainel, linkReuniao, novaReuniao, textoConvite, useReunioes, type Reuniao } from "@/components/chat-interno/ReunioesPainel";
import { CalendarioPlanner } from "@/components/chat-interno/CalendarioPlanner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { confirmar } from "@/components/layout/DialogoGlobal";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Clock, Users } from "lucide-react";
import { CORES_AGENDA, EXPEDIENTE_PADRAO, conflitosBloqueio, type Bloqueio, type Expediente } from "@/lib/planner-calendario";
import {
  calcularPerformance, diaDoItem, horas, inicioSemana, lerEventos, normalizarPrioridade, novasRemarcacoes, ordenar, somarDias, textoRemarcacao,
  type PlannerItem,
  progressoTarefaPatch,
} from "@/lib/planner";
import { ProgressoTarefa } from "@/components/chat-interno/ProgressoTarefa";
import { LinkAgendamentoDialog } from "@/components/chat-interno/LinkAgendamentoDialog";
import { Link2, Plus, PanelLeft, CalendarDays, LayoutGrid, ListTodo } from "lucide-react";

const hoje = () => new Date().toISOString().slice(0, 10);
const dataBR = (s: string) => { const [a, m, d] = s.slice(0, 10).split("-"); return `${d}/${m}/${a}`; };
const tb = (t: string) => supabase.from(t as never) as unknown as ReturnType<typeof supabase.from>;
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const BOLINHA_COR: Record<string, string> = { primary: "bg-primary", success: "bg-success", warning: "bg-warning", destructive: "bg-destructive", accent: "bg-accent-foreground" };
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
    progresso: st === "concluida" ? 100 : Number(t["progresso"] ?? 0) || 0,
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
  const definirProgresso = async (i: PlannerItem, pct: number) => {
    if (i.origem !== "tarefa") return false;
    const r = await tb("tarefas_usuarios").update(progressoTarefaPatch(pct) as never).eq("id", i.id);
    if (r.error) { toast.error(r.error.message.includes("progresso") ? "Rode o script atendeai-tarefas-progresso.sql no banco." : r.error.message); return false; }
    if (pct >= 100) tocarSom("equipe");
    if (autorId) await registrarEvento(i.id, autorId, pct >= 100 ? "🏁 Tarefa concluída (100%)." : `Progresso atualizado para ${pct}%.`);
    recarregar();
    return true;
  };
  return { itens: q.data ?? [], isLoading: q.isLoading, concluir, planejar, definirProgresso, recarregar };
}

export function ItemLinha({ i, onCheck, compacto, editavel = true, onAbrir, nome, onProgresso }: { i: PlannerItem; onCheck: (feito: boolean) => void; compacto?: boolean; editavel?: boolean; onAbrir?: () => void; nome?: (id: string) => string; onProgresso?: (p: number) => void }) {
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
        {onProgresso && i.origem === "tarefa" && <ProgressoTarefa valor={i.progresso ?? 0} disabled={!editavel} onChange={onProgresso} />}
      </div>
    </div>
  );
}

/** Planner completo em tela cheia: backlog + semana + performance + relatório. */
const nomeUsuario = (usuarios: Row[], id: string) => String(pick(usuarios.find((u) => String(u["id"]) === id) ?? {}, ["nome"], "O responsável"));

export function PlannerPainel({ me, empresaId, usuarios, onFechar, embutido, acoes, onNovaTarefa, onAvisar }: { me: string; empresaId: string; usuarios: Row[]; onFechar?: () => void; embutido?: boolean; acoes?: React.ReactNode; onNovaTarefa?: (dia: string) => void; onAvisar?: (usuarioId: string, texto: string) => Promise<void> }) {
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
  const [linkAberto, setLinkAberto] = useState(false);
  const [modo, setModo] = useState<"agenda" | "quadro" | "tarefas">("agenda");
  const [lateral, setLateral] = useState(true);
  const [filtroT, setFiltroT] = useState<"hoje" | "atrasadas" | "semana" | "semdata" | "concluidas">("hoje");
  const [editarReuniao, setEditarReuniao] = useState<Reuniao | null>(null);
  const qcReuniao = useQueryClient();
  const cancelarReuniao = async (r: Reuniao) => {
    if (!(await confirmar(`Cancelar a reunião "${r.titulo}"?`))) return;
    const x = await tb("reunioes").update({ cancelada: true } as never).eq("id", r.id);
    if (x.error) return void toast.error(x.error.message);
    toast.success("Reunião cancelada.");
    void qcReuniao.invalidateQueries({ queryKey: ["reunioes", empresaId] });
  };
  const reunioes = useReunioes(empresaId).data ?? [];
  const chaveAgendas = `planner_agendas_extras_${me}`;
  const [extras, setExtrasState] = useState<string[]>([]);
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(chaveAgendas) ?? "[]"); if (Array.isArray(v)) setExtrasState(v.map(String)); } catch { /* ignora */ }
  }, [chaveAgendas]);
  const setExtras = (v: string[] | ((p: string[]) => string[])) => setExtrasState((p) => {
    const n = typeof v === "function" ? v(p) : v;
    try { localStorage.setItem(chaveAgendas, JSON.stringify(n)); } catch { /* ignora */ }
    return n;
  });
  const [buscaAg, setBuscaAg] = useState("");
  const agendas = useMemo(() => [alvo, ...extras.filter((x) => x !== alvo)], [alvo, extras]);
  const expQ = useQuery({
    queryKey: ["planner-expediente", alvo], enabled: !!alvo,
    queryFn: async () => {
      const r = await tb("planner_expediente").select("*").eq("usuario_id", alvo).maybeSingle();
      if (r.error || !r.data) return EXPEDIENTE_PADRAO;
      const d = r.data as Row;
      return { dias: (d["dias"] as number[]) ?? EXPEDIENTE_PADRAO.dias, inicio: String(d["inicio"] ?? "08:00"), fim: String(d["fim"] ?? "18:00") } as Expediente;
    },
  });
  const expediente = expQ.data ?? EXPEDIENTE_PADRAO;
  const [expEdit, setExpEdit] = useState<Expediente | null>(null);
  const salvarExpediente = async () => {
    if (!expEdit) return;
    if (expEdit.inicio >= expEdit.fim) return void toast.error("O fim do expediente deve ser depois do início.");
    const r = await tb("planner_expediente").upsert({ usuario_id: me, empresa_id: empresaId, ...expEdit, updated_at: new Date().toISOString() } as never);
    if (r.error) return void toast.error(r.error.message.includes("planner_expediente") ? "Rode o script atendeai-planner-agenda.sql no banco." : r.error.message);
    toast.success("Horário de trabalho salvo.");
    setExpEdit(null);
    void qcReuniao.invalidateQueries({ queryKey: ["planner-expediente", me] });
  };
  const bloqQ = useQuery({
    queryKey: ["planner-bloqueios", agendas.join(",")],
    queryFn: async () => {
      const r = await tb("planner_bloqueios").select("*").in("usuario_id", agendas).limit(2000);
      if (r.error) return [] as Bloqueio[];
      return ((r.data ?? []) as Row[]).map((b) => ({ id: String(b["id"]), usuario_id: String(b["usuario_id"]), inicio: String(b["inicio"]), fim: String(b["fim"]), titulo: String(b["titulo"] ?? "") }));
    },
  });
  const bloqueios = bloqQ.data ?? [];
  const criarBloqueio = async (inicio: Date, titulo: string) => {
    const fim = new Date(inicio.getTime() + 60 * 60000);
    if (conflitosBloqueio(bloqueios, me, inicio, fim).length) return void toast.info("Você já está indisponível nesse horário.");
    const r = await tb("planner_bloqueios").insert({ empresa_id: empresaId, usuario_id: me, inicio: inicio.toISOString(), fim: fim.toISOString(), titulo: titulo || "Indisponível" } as never);
    if (r.error) return void toast.error(r.error.message.includes("planner_bloqueios") ? "Rode o script atendeai-planner-agenda.sql no banco." : r.error.message);
    toast.success("Horário marcado como indisponível (1h).");
    void bloqQ.refetch();
  };
  const excluirBloqueio = async (b: Bloqueio) => {
    if (!(await confirmar("Remover este bloqueio da agenda?"))) return;
    const r = await tb("planner_bloqueios").delete().eq("id", b.id);
    if (r.error) return void toast.error(r.error.message);
    void bloqQ.refetch();
  };
  const { itens, concluir, planejar, definirProgresso } = usePlannerItens(alvo, me);
  const progredir = async (i: PlannerItem, p: number) => {
    const ok = await definirProgresso(i, p);
    if (ok && p >= 100 && i.status !== "concluida" && onAvisar && i.criadoPor && i.criadoPor !== me) {
      const quem = nomeUsuario(usuarios, me);
      await onAvisar(i.criadoPor, `🏁 ${quem} concluiu a tarefa "${i.titulo}" (100%).`).catch(() => undefined);
    }
  };
  const proprio = alvo === me;
  const mapaNomes = useMemo(() => new Map(usuarios.map((u) => [String(u["id"]), String(pick(u, ["nome"], "Usuário"))])), [usuarios]);
  const nomeDe = (id: string) => (id === me ? "Você" : mapaNomes.get(id) ?? "Usuário");
  const ativos = itens.filter((i) => i.status === "aberta" || i.status === "concluida");
  const backlog = ordenar(ativos.filter((i) => !diaDoItem(i) && i.status !== "concluida"));
  const dias = DIAS.map((_, n) => somarDias(semana, n));
  const atrasadas = ativos.filter((i) => i.status !== "concluida" && (diaDoItem(i) ?? "9") < hoje());
  const perf = useMemo(() => calcularPerformance(itens, desde, ate), [itens, desde, ate]);
  const pessoas = useMemo(() => [...usuarios].sort((a, b) => String(pick(a, ["nome"], "")).localeCompare(String(pick(b, ["nome"], "")), "pt-BR")), [usuarios]);
  const agendaDe = (ids: string[]) => {
    if (agendas.length < 2) return null;
    const i = agendas.findIndex((a) => ids.includes(a));
    if (i < 0) return null;
    return { cor: CORES_AGENDA[i % CORES_AGENDA.length]!, nome: agendas[i] === me ? "Você" : mapaNomes.get(agendas[i]!) ?? "Usuário" };
  };
  const nomeAlvo = proprio ? String(pick(usuario, ["nome"], "Você")) : String(pick(usuarios.find((u) => String(u["id"]) === alvo) ?? {}, ["nome"], "Usuário"));
  const detalhes = ordenar(itens.filter((i) => { const d = diaDoItem(i); return i.status !== "recusada" && i.status !== "aguardando" && d && d >= desde && d <= ate; }));
  const farol = perf.classificacao === "Excelente" ? "text-success" : perf.classificacao === "Bom" ? "text-warning" : "text-destructive";

  const abertasT = ativos.filter((i) => i.status !== "concluida");
  const fimSemana = somarDias(hoje(), 6);
  const gruposT = {
    hoje: ordenar(abertasT.filter((i) => diaDoItem(i) === hoje())),
    atrasadas: ordenar(atrasadas),
    semana: ordenar(abertasT.filter((i) => { const d = diaDoItem(i); return !!d && d >= hoje() && d <= fimSemana; })),
    semdata: backlog,
    concluidas: ativos.filter((i) => i.status === "concluida").sort((x, y) => String(y.concluidoEm ?? "").localeCompare(String(x.concluidoEm ?? ""))).slice(0, 100),
  };
  const ROT_T = { hoje: "Hoje", atrasadas: "Atrasadas", semana: "Próximos 7 dias", semdata: "Sem data", concluidas: "Concluídas" } as const;
  const visaoTarefas = (
    <div className="w-full">
      <div role="group" aria-label="Filtrar tarefas" className="mb-3 flex flex-wrap gap-1.5">
        {(Object.keys(ROT_T) as (keyof typeof ROT_T)[]).map((k) => (
          <button key={k} type="button" onClick={() => setFiltroT(k)} aria-pressed={filtroT === k}
            className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", filtroT === k ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted", k === "atrasadas" && gruposT.atrasadas.length > 0 && filtroT !== k && "border-destructive text-destructive")}>
            {ROT_T[k]} <span className="rounded-full bg-background/20 px-1.5">{gruposT[k].length}</span>
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        {gruposT[filtroT].length === 0 && <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhuma tarefa em “{ROT_T[filtroT]}”.</p>}
        {gruposT[filtroT].map((i) => (
          <div key={i.id} className="flex items-start gap-2">
            <div className="min-w-0 flex-1"><ItemLinha i={i} nome={nomeDe} editavel={proprio} onCheck={(f) => void concluir(i, f)} onAbrir={() => setAberta(i.id)} onProgresso={(p) => void progredir(i, p)} /></div>
            {proprio && i.origem === "tarefa" && i.status !== "concluida" && (
              <Input type="date" aria-label="Planejar para o dia" className="h-8 w-36 text-xs" value={i.planejada ?? ""} onChange={(e) => void planejar(i, e.target.value || null)} />
            )}
          </div>
        ))}
      </div>
    </div>
  );

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
            <DropdownMenu key={r.id}>
              <DropdownMenuTrigger asChild>
                <button type="button"
                  className="flex w-full items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 p-2 text-left text-xs hover:bg-primary/20">
                  <Video className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1"><b className="block truncate">{r.titulo}</b>{new Date(r.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {r.duracao_min} min</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="z-[80]">
                <DropdownMenuItem onClick={() => window.open(`${linkReuniao(r)}${r.video ? "?" : "&"}org=${r.id}`, "_blank")}><LogIn className="mr-2 h-4 w-4" /> Entrar</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(textoConvite(r)).then(() => toast.success("Convite copiado."))}><Copy className="mr-2 h-4 w-4" /> Copiar convite</DropdownMenuItem>
                {r.criado_por === me && <DropdownMenuItem onClick={() => { setEditarReuniao(r); setReunioesAberto(true); }}><Pencil className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>}
                {r.criado_por === me && <DropdownMenuItem className="text-destructive" onClick={() => void cancelarReuniao(r)}><Ban className="mr-2 h-4 w-4" /> Cancelar reunião</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
          {lista.map((i) => (
            <div key={i.id} draggable={proprio && i.origem === "tarefa"} onDragStart={() => setArrastando(i.id)} className={cn(proprio && i.origem === "tarefa" && "cursor-grab")}>
              <ItemLinha i={i} nome={nomeDe} editavel={proprio} onCheck={(f) => void concluir(i, f)} onAbrir={() => setAberta(i.id)} onProgresso={(p) => void progredir(i, p)} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={cn("flex flex-col bg-background", embutido ? "min-h-full" : "fixed inset-0 z-[70]")}>
      <div className={cn("space-y-2", embutido ? "pb-3" : "border-b border-border px-4 py-3")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Visualização" className="flex rounded-lg border border-border p-0.5">
          {([["agenda", "Agenda", CalendarDays], ["quadro", "Quadro semanal", LayoutGrid], ["tarefas", "Tarefas", ListTodo]] as const).map(([v, t, I]) => (
            <button key={v} role="tab" aria-selected={modo === v} type="button" onClick={() => setModo(v)}
              className={cn("inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium", modo === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              <I className="h-3.5 w-3.5" /><span className="sr-only sm:not-sr-only">{t}</span>
            </button>
          ))}
        </div>
          <div className="flex flex-wrap items-center gap-2">
        {proprio && atrasadas.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => void Promise.all(atrasadas.filter((i) => i.origem === "tarefa").map((i) => planejar(i, hoje())))}>
            Trazer {atrasadas.length} pendência(s) para hoje
          </Button>
        )}
            {acoes}
            {!embutido && onFechar && <Button size="sm" variant="ghost" aria-label="Fechar planner" onClick={onFechar}><X className="h-5 w-5" /></Button>}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <Button size="icon" variant="ghost" aria-expanded={lateral} aria-label={lateral ? "Ocultar painel lateral" : "Mostrar painel lateral"} onClick={() => setLateral((v) => !v)}><PanelLeft className="h-5 w-5" /></Button>
            <h1 className="truncate text-2xl font-bold text-foreground">Planner — {nomeAlvo}</h1>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button ><Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Criar</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[80] w-56">
              <DropdownMenuItem onClick={() => onNovaTarefa ? onNovaTarefa(hoje()) : toast.info("Abra o Planner pelo menu para criar tarefas.")}><ListTodo className="mr-2 h-4 w-4" /> Tarefa</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); setEditarReuniao(novaReuniao(me, d)); setReunioesAberto(true); }}><Video className="mr-2 h-4 w-4" /> Reunião</DropdownMenuItem>
              {proprio && <DropdownMenuItem onClick={() => setLinkAberto(true)}><Link2 className="mr-2 h-4 w-4" /> Link de agendamento</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <LinkAgendamentoDialog open={linkAberto} onOpenChange={setLinkAberto} me={me} empresaId={empresaId} nome={String(pick(usuario, ["nome"], ""))} />
      {reunioesAberto && <ReunioesPainel key={editarReuniao ? editarReuniao.id || editarReuniao.sala : "lista"} me={me} empresaId={empresaId} usuarios={usuarios} editar={editarReuniao} onFechar={() => { setReunioesAberto(false); setEditarReuniao(null); }} />}
      <TarefaDetalhe id={aberta} me={me} usuarios={usuarios} onFechar={() => setAberta(null)} onAvisar={onAvisar} />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      {lateral && (
        <aside aria-label="Atalhos e agendas" className="w-full shrink-0 space-y-4 overflow-y-auto rounded-lg border border-border bg-card p-3 md:mr-4 md:w-60">

          <div className="space-y-0.5">
            <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Atalhos</p>
            <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => setReunioesAberto(true)}><CalendarClock className="mr-1 h-4 w-4" /> Reuniões</Button>
            {proprio && <Button size="sm" variant="ghost" className="w-full justify-start" onClick={() => setLinkAberto(true)}><Link2 className="mr-1 h-4 w-4" /> Link de agendamento</Button>}
            {proprio && (
          <Popover open={!!expEdit} onOpenChange={(o) => setExpEdit(o ? expediente : null)}>
            <PopoverTrigger asChild><Button size="sm" variant="ghost" className="w-full justify-start"><Clock className="mr-1 h-4 w-4" /> Horário de trabalho</Button></PopoverTrigger>
            <PopoverContent className="z-[80] w-72" align="start">
              {expEdit && (
                <div className="space-y-3">
                  <Label>Dias de trabalho</Label>
                  <div className="flex gap-1">
                    {["D", "S", "T", "Q", "Q", "S", "S"].map((l, d) => (
                      <button key={d} type="button" onClick={() => setExpEdit({ ...expEdit, dias: expEdit.dias.includes(d) ? expEdit.dias.filter((x) => x !== d) : [...expEdit.dias, d].sort() })}
                        className={cn("h-8 w-8 rounded-full border border-border text-xs", expEdit.dias.includes(d) && "bg-primary text-primary-foreground")}>{l}</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Início</Label><Input type="time" value={expEdit.inicio} onChange={(e) => setExpEdit({ ...expEdit, inicio: e.target.value })} /></div>
                    <div><Label className="text-xs">Fim</Label><Input type="time" value={expEdit.fim} onChange={(e) => setExpEdit({ ...expEdit, fim: e.target.value })} /></div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => setExpEdit(null)}>Cancelar</Button>
                    <Button size="sm" onClick={() => void salvarExpediente()}>Salvar</Button>
                  </div>
                </div>
              )}
            </PopoverContent>
          </Popover>
            )}
          </div>

          <div>
            <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Agendas</p>
            {alvo !== me && <Button size="sm" variant="outline" className="mb-2 w-full" onClick={() => setAlvo(me)}>Voltar para minha agenda</Button>}
            <div className="mb-1 flex items-center gap-2 rounded px-1 py-1 text-sm">
              <span className={cn("h-2.5 w-2.5 rounded-full", BOLINHA_COR[CORES_AGENDA[0]!])} />
              <span className="flex-1 truncate font-medium">{proprio ? "Minha agenda" : nomeAlvo}</span>
            </div>
            <Input placeholder="Pesquisar pessoa" value={buscaAg} onChange={(e) => setBuscaAg(e.target.value)} className="mb-1 h-8" />
            <div className="max-h-80 space-y-0.5 overflow-y-auto">
              {pessoas.filter((u) => String(u["id"]) !== alvo && String(pick(u, ["nome"], "")).toLowerCase().includes(buscaAg.toLowerCase())).map((u) => {
                const id = String(u["id"]); const on = extras.includes(id);
                const cor = on ? agendaDe([id])?.cor : null;
                return (
                  <div key={id} className="group flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                    <Checkbox id={`ag-${id}`} checked={on} onCheckedChange={(v) => setExtras((x) => v ? [...x, id] : x.filter((y) => y !== id))} aria-label={`Sobrepor agenda de ${String(pick(u, ["nome"], "Usuário"))}`} />
                    <label htmlFor={`ag-${id}`} className="flex-1 cursor-pointer truncate">{String(pick(u, ["nome"], "Usuário"))}</label>
                    {cor && <span className={cn("h-2.5 w-2.5 rounded-full", BOLINHA_COR[cor])} />}
                    {gestor && <button type="button" title="Abrir como agenda principal" aria-label="Abrir como agenda principal" onClick={() => setAlvo(id)} className="text-[10px] text-primary opacity-0 hover:underline focus:opacity-100 group-hover:opacity-100">Abrir</button>}
                  </div>
                );
              })}
            </div>
            {extras.length > 0 && <Button size="sm" variant="ghost" className="mt-1 w-full" onClick={() => setExtras([])}>Limpar seleção</Button>}
          </div>
        </aside>
      )}
      <div className="min-h-0 min-w-0 flex-1 overflow-auto pt-3 md:pt-0">
        {modo === "tarefas" ? visaoTarefas : modo === "agenda" ? (
          <CalendarioPlanner me={me} proprio={proprio}
            reunioes={reunioes.filter((r) => !r.cancelada && agendas.some((a) => r.criado_por === a || r.participantes.includes(a)))}
            itens={ativos}
            expediente={expediente}
            bloqueios={bloqueios}
            agendaDe={agendaDe}
            onExcluirBloqueio={(b) => void excluirBloqueio(b)}
            onAbrirTarefa={setAberta}
            onConcluir={(i, f) => void concluir(i, f)}
            onEditarReuniao={(r) => { setEditarReuniao(r); setReunioesAberto(true); }}
            onCancelarReuniao={(r) => void cancelarReuniao(r)}
            onCriar={(n) => {
              if (n.tipo === "indisponivel") {
                if (!proprio) return void toast.info("Só é possível bloquear a sua própria agenda.");
                return void criarBloqueio(n.inicio, n.titulo);
              }
              if (conflitosBloqueio(bloqueios, me, n.inicio, new Date(n.inicio.getTime() + 3600000)).length) toast.warning("Atenção: você marcou esse horário como indisponível.");
              if (n.tipo === "tarefa") {
                const dia = n.inicio.toLocaleDateString("sv-SE");
                if (onNovaTarefa) onNovaTarefa(dia); else toast.info("Abra o Planner pelo menu para criar tarefas.");
                return;
              }
              setEditarReuniao({ ...novaReuniao(me, n.inicio), titulo: n.titulo, modalidade: n.tipo });
              setReunioesAberto(true);
            }} />
        ) : (<>
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
                  <ItemLinha i={i} nome={nomeDe} editavel={proprio} onCheck={(f) => void concluir(i, f)} onAbrir={() => setAberta(i.id)} onProgresso={(p) => void progredir(i, p)} />
                </div>
              ))}
            </div>
          </div>
          {dias.map((d, n) => coluna(`${DIAS[n]} ${d.slice(8, 10)}/${d.slice(5, 7)}`, d, ordenar(ativos.filter((i) => diaDoItem(i) === d))))}
        </div>
        </>)}

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
