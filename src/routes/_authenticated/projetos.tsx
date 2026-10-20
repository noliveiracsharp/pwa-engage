import { IniciaisResponsaveis, ResponsaveisPicker, responsaveisDe } from "@/components/projetos/ResponsaveisPicker";
import { Fragment, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Pencil, Plus, Settings, Share2, Trash2, ListChecks, Download, List, Columns3, Printer } from "lucide-react";
import { ProjetoPrint } from "@/components/projetos/ProjetoPrint";

async function compartilhar(projeto: Row) {
  let token = projeto["token_compartilhamento"] as string | null | undefined;
  if (!token) {
    token = crypto.randomUUID();
    const { error } = await supabase.from("projetos").update({ token_compartilhamento: token } as never).eq(idColumn(projeto), rowId(projeto) as never);
    if (error) { toast.error(error.message); return; }
  }
  const url = `${window.location.origin}/compartilhado/${token}`;
  try { await navigator.clipboard.writeText(url); toast.success("Link do cliente copiado!", { description: url }); }
  catch { await perguntar({ title: "Copie o link do cliente", defaultValue: url, confirmText: "Fechar", required: false }); }
}
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { StatusDialog } from "@/components/projetos/StatusDialog";
import { TAREFAS_PADRAO, diasDoModelo } from "@/components/projetos/TarefasPadraoDialog";
import { EspacosSidebar, ESPACOS, cadeiaEspaco, espacoEDescendentes, tipoEspaco } from "@/components/projetos/EspacosSidebar";
import { TarefaSheet } from "@/components/projetos/TarefaSheet";
import { AtividadeSheet } from "@/components/projetos/AtividadeSheet";
import { EspacoDashboard } from "@/components/projetos/EspacoDashboard";
import { TarefasEspaco } from "@/components/projetos/TarefasEspaco";
import { useTableRows, rowId, idColumn, matches } from "@/lib/crud";
import { SortableList, salvarOrdem, useSortableRow } from "@/lib/reorder";
import { useAudit } from "@/lib/audit";
import { usePagePermissions, type Perms } from "@/hooks/usePagePermissions";
import { ATIVIDADES, atividadePct, periodo, C, doneValue, duplicarAtividade, duplicarTarefa, excluirTarefaComFilhos, filterPayload, fmtDate, isDone, nomePessoa, prioridadeClass, progressoCor, resolveCol, sincronizarTarefa, tarefaPct, useCols } from "@/lib/projetos";
import { AcoesTarefa } from "@/components/projetos/AcoesTarefa";
import { ArrowDown, ArrowUp, Copy } from "lucide-react";
import type { Row } from "@/lib/row";
import { confirmar, perguntar } from "@/components/layout/DialogoGlobal";

export const Route = createFileRoute("/_authenticated/projetos")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Projetos — Atende.ai" },
      { name: "description", content: "Gerencie projetos por status, tarefas, checklists, dependências e anexos." },
      { property: "og:title", content: "Projetos — Atende.ai" },
      { property: "og:description", content: "Gerencie projetos por status, tarefas, checklists, dependências e anexos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { espaco?: string } => (typeof s["espaco"] === "string" && s["espaco"] ? { espaco: s["espaco"] } : {}),
  component: ProjetosPage,
});

function useProjetoData() {
  const { data: status = [] } = useTableRows("projetos_status");
  const { data: projetos = [], isLoading } = useTableRows("projetos");
  const { data: tarefas = [] } = useTableRows("projetos_tarefas", true, "ordem");
  const { data: parceiros = [] } = useTableRows("parceiros");
  const { data: usuarios = [] } = useTableRows("usuarios");
  const { data: pCols } = useCols("projetos");
  const { data: tCols } = useCols("projetos_tarefas");
  const { data: sCols } = useCols("projetos_status");
  const { data: espacos = [] } = useTableRows(ESPACOS);
  const { data: templates = [] } = useTableRows("projetos_templates");
  const { data: atividades = [] } = useTableRows(ATIVIDADES, true, "ordem");
  const pc = {
    nome: resolveCol(pCols, projetos, C.projeto.nome),
    status: resolveCol(pCols, projetos, C.projeto.status),
    parceiro: resolveCol(pCols, projetos, C.projeto.parceiro),
    descricao: resolveCol(pCols, projetos, C.projeto.descricao),
    ini: resolveCol(pCols, projetos, C.projeto.dtInicio),
    fim: resolveCol(pCols, projetos, C.projeto.dtFim),
  };
  const tc = {
    projeto: resolveCol(tCols, tarefas, C.tarefa.projeto),
    nome: resolveCol(tCols, tarefas, C.tarefa.nome),
    resp: resolveCol(tCols, tarefas, C.tarefa.responsavel),
    ini: resolveCol(tCols, tarefas, C.tarefa.dtInicio),
    fim: resolveCol(tCols, tarefas, C.tarefa.dtFim),
    prio: resolveCol(tCols, tarefas, C.tarefa.prioridade),
    done: resolveCol(tCols, tarefas, C.tarefa.concluida),
  };
  const sc = {
    nome: resolveCol(sCols, status, C.status.nome),
    ordem: resolveCol(sCols, status, C.status.ordem),
    cor: resolveCol(sCols, status, C.status.cor),
  };
  return { atividades, espacos, templates, status, projetos, tarefas, parceiros, usuarios, pCols, tCols, pc, tc, sc, isLoading };
}

function ProjetosPage() {
  const perms = usePagePermissions("/projetos");
  const d = useProjetoData();
  const { espaco } = Route.useSearch();
  const navigate = useNavigate({ from: "/projetos" });
  const qc = useQueryClient();
  const espacoId = espaco && d.espacos.some((e) => String(rowId(e)) === espaco) ? espaco : null;
  const [selId, setSelId] = useState<string | null>(null);
  const [aba, setAba] = useState<"painel" | "tarefas" | "projetos" | null>(null);
  const sel = d.projetos.find((p) => String(rowId(p)) === selId);
  if (sel) return <Detalhe projeto={sel} d={d} perms={perms} onBack={() => setSelId(null)} />;
  const espAtual = espacoId ? d.espacos.find((e) => String(rowId(e)) === espacoId) : undefined;
  const ir = (id: string | null) => navigate({ search: id ? { espaco: id } : {} });
  async function moverEspaco(projetoId: string, destino: string) {
    const p = d.projetos.find((x) => String(rowId(x)) === projetoId);
    if (!p || String(p["espaco_id"] ?? "") === destino) return;
    const v: Row = { espaco_id: destino };
    const novos = statusDoEspaco(d, destino);
    if (!novos.some((s) => String(rowId(s)) === String(p[d.pc.status] ?? ""))) {
      const primeiro = [...novos].sort((a, b) => Number(a[d.sc.ordem] ?? 0) - Number(b[d.sc.ordem] ?? 0))[0];
      v[d.pc.status] = primeiro ? rowId(primeiro) : null;
    }
    const { error } = await supabase.from("projetos").update(v as never).eq(idColumn(p), rowId(p) as never);
    if (error) { toast.error(error.message); return; }
    const nome = String(d.espacos.find((e) => String(rowId(e)) === destino)?.["nome"] ?? "");
    toast.success(`Projeto "${String(p[d.pc.nome] ?? "")}" movido para ${nome}.`);
    qc.invalidateQueries({ queryKey: ["table", "projetos"] });
  }
  // Lista abre as tarefas por status; Espaço, Pasta e Projeto abrem a visão geral.
  const raiz = !!espAtual && tipoEspaco(espAtual) !== "lista";
  const abaAtual = !espacoId ? "projetos" : aba ?? (raiz ? "painel" : "tarefas");
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <EspacosSidebar espacos={d.espacos} ativo={espacoId} perms={perms} onSelect={(id) => { setAba(null); ir(id); }} onMoverProjeto={moverEspaco} />
      <div className="min-w-0 flex-1 space-y-3">
        {espacoId && (
          <div className="flex flex-wrap items-center gap-3">
            {abaAtual === "tarefas" && <h1 className="text-2xl font-bold text-foreground">{String(espAtual?.["nome"] ?? "")}</h1>}
            <div className="flex rounded-md border border-border p-0.5" role="tablist" aria-label="Visão do espaço">
              {raiz && <Button size="sm" variant={abaAtual === "painel" ? "secondary" : "ghost"} onClick={() => setAba("painel")}>Visão geral</Button>}
              <Button size="sm" variant={abaAtual === "tarefas" ? "secondary" : "ghost"} onClick={() => setAba("tarefas")}>Tarefas</Button>
              <Button size="sm" variant={abaAtual === "projetos" ? "secondary" : "ghost"} onClick={() => setAba("projetos")}>Projetos</Button>
            </div>
          </div>
        )}
        {abaAtual === "painel" && espAtual
          ? <EspacoDashboard espaco={espAtual} espacos={d.espacos} projetos={d.projetos} tarefas={d.tarefas} status={d.status} pc={d.pc} tc={d.tc} onAcessar={ir} />
          : abaAtual === "tarefas" && espacoId
            ? <TarefasEspaco espacoId={espacoId} espacos={d.espacos} projetos={d.projetos} tarefas={d.tarefas} atividades={d.atividades}
                statusList={statusDoEspaco(d, espacoId)} usuarios={d.usuarios} tc={d.tc} statusNome={d.sc.nome} statusOrdem={d.sc.ordem} statusCor={d.sc.cor}
                projetoNome={d.pc.nome} tCols={d.tCols} perms={perms} />
            : <Painel d={d} perms={perms} espacoId={espacoId} onOpen={(id) => setSelId(id)} />}
      </div>
    </div>
  );
}

/** Status valendo para o espaço: os próprios; senão os do espaço acima; por fim os gerais (sem espaço). */
function statusDoEspaco(d: D, espacoId: string | null): Row[] {
  for (const id of cadeiaEspaco(d.espacos, espacoId)) {
    const proprios = d.status.filter((s) => String(s["espaco_id"] ?? "") === id);
    if (proprios.length) return proprios;
  }
  return d.status.filter((s) => !s["espaco_id"]);
}

type D = ReturnType<typeof useProjetoData>;

function nomeGestor(d: D, p: Row): string {
  const g = p["gestor_id"] ? d.usuarios.find((u) => String(rowId(u)) === String(p["gestor_id"])) : undefined;
  return g ? String(g["nome"] ?? g["email"] ?? "") : "";
}

function progresso(d: D, projetoId: string) {
  const ts = d.tarefas.filter((t) => String(t[d.tc.projeto]) === projetoId);
  const ok = ts.filter((t) => tarefaPct(t, d.tc.done) >= 100).length;
  const soma = ts.reduce((a, t) => a + tarefaPct(t, d.tc.done), 0);
  return { total: ts.length, ok, pct: ts.length ? Math.round(soma / ts.length) : 0 };
}

function Painel({ d, perms, espacoId, onOpen }: { d: D; perms: Perms; espacoId: string | null; onOpen: (id: string) => void }) {
  const [busca, setBusca] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [form, setForm] = useState<Row | null | "new">(null);
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const qc = useQueryClient();

  const grupos = useMemo(() => {
    const doEspaco = espacoId ? espacoEDescendentes(d.espacos, espacoId) : null;
    const usados = new Set(d.projetos.map((p) => String(p[d.pc.status] ?? "")));
    const base = espacoId
      ? statusDoEspaco(d, espacoId)
      : d.status.filter((s) => !s["espaco_id"] || usados.has(String(rowId(s))));
    const ordered = [...base].sort((a, b) => Number(a[d.sc.ordem] ?? 0) - Number(b[d.sc.ordem] ?? 0));
    const filtered = d.projetos.filter((p) => {
      if (doEspaco && !doEspaco.has(String(p["espaco_id"] ?? ""))) return false;
      const cli = nomePessoa(d.parceiros.find((x) => String(rowId(x)) === String(p[d.pc.parceiro])));
      return matches(`${p[d.pc.nome] ?? ""} ${cli}`, busca);
    });
    const ids = new Set(ordered.map((s) => String(rowId(s))));
    // Em "Todos os projetos", status de espaços diferentes com o mesmo nome viram uma só coluna.
    const porNome = new Map<string, { id: string; nome: string; cor: string; sids: Set<string> }>();
    for (const s of ordered) {
      const nome = String(s[d.sc.nome] ?? "");
      const k = espacoId ? String(rowId(s)) : nome.trim().toLowerCase();
      const atual = porNome.get(k);
      if (atual) atual.sids.add(String(rowId(s)));
      else porNome.set(k, { id: String(rowId(s)), nome, cor: String(s[d.sc.cor] ?? ""), sids: new Set([String(rowId(s))]) });
    }
    const g = [...porNome.values()].map((x) => ({
      id: x.id, nome: x.nome, cor: x.cor,
      itens: filtered.filter((p) => x.sids.has(String(p[d.pc.status] ?? ""))),
    }));
    const sem = filtered.filter((p) => !ids.has(String(p[d.pc.status] ?? "")));
    // Sempre presente (quando há status) para permitir soltar um projeto em "Sem status".
    if (sem.length || g.length) g.push({ id: "__sem", nome: "Sem status", cor: "", itens: sem });
    return g;
  }, [d, busca, espacoId]);

  const espacoNome = espacoId ? String(d.espacos.find((e) => String(rowId(e)) === espacoId)?.["nome"] ?? "") : "";
  const [apagar, setApagar] = useState<Row | null>(null);
  const [confirmaNome, setConfirmaNome] = useState("");
  const [apagando, setApagando] = useState(false);
  function excluir(p: Row) { setApagar(p); setConfirmaNome(""); }
  async function confirmarExclusao() {
    if (!apagar) return;
    setApagando(true);
    try {
      const id = String(rowId(apagar));
      const tIds = d.tarefas.filter((t) => String(t[d.tc.projeto]) === id).map((t) => rowId(t));
      if (tIds.length) {
        const filhos: [string, string[]][] = [
          ["projetos_tarefas_checklists", C.check.tarefa],
          ["projetos_tarefas_dependencias", [...C.dep.tarefa, ...C.dep.depende]],
          ["projetos_tarefas_anexos", C.anexo.tarefa],
        ];
        for (const [tab, cols] of filhos) {
          for (const col of cols) {
            await supabase.from(tab).delete().in(col, tIds as never[]);
          }
        }
        const { error } = await supabase.from("projetos_tarefas").delete().in(d.tc.projeto, [rowId(apagar)] as never[]);
        if (error) { toast.error(error.message); return; }
      }
      const { error } = await supabase.from("projetos").delete().eq(idColumn(apagar), rowId(apagar) as never);
      if (error) { toast.error(error.message); return; }
      toast.success("Projeto excluído.");
      setApagar(null);
      qc.invalidateQueries({ queryKey: ["table", "projetos"] });
      qc.invalidateQueries({ queryKey: ["table", "projetos_tarefas"] });
    } finally { setApagando(false); }
  }
  const nomeApagar = apagar ? String(apagar[d.pc.nome] ?? "") : "";

  const [modo, setModo] = useState<"lista" | "kanban">("lista");
  const [arrastando, setArrastando] = useState<string | null>(null);
  async function moverStatus(projetoId: string, statusId: string) {
    const p = d.projetos.find((x) => String(rowId(x)) === projetoId);
    if (!p) return;
    const novo = statusId === "__sem" ? null : statusId;
    if (String(p[d.pc.status] ?? "") === String(novo ?? "")) return;
    qc.setQueryData<Row[]>(["table", "projetos"], (old = []) => old.map((x) => (String(rowId(x)) === projetoId ? { ...x, [d.pc.status]: novo } : x)));
    const { error } = await supabase.from("projetos").update({ [d.pc.status]: novo } as never).eq(idColumn(p), rowId(p) as never);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["table", "projetos"] });
  }
  function cardProjeto(p: Row) {
                    const id = String(rowId(p));
                    const pr = progresso(d, id);
                    const cli = d.parceiros.find((x) => String(rowId(x)) === String(p[d.pc.parceiro]));
                    return (
                      <div key={id} role="button" draggable={perms.canUpdate} onDragStart={(e) => { e.dataTransfer.setData("text/projeto-id", id); e.dataTransfer.effectAllowed = "move"; setArrastando(id); }} onDragEnd={() => setArrastando(null)} tabIndex={0} onClick={() => onOpen(id)} onKeyDown={(e) => e.key === "Enter" && onOpen(id)}
                        className="group cursor-pointer space-y-2 rounded-md border border-border bg-background p-3 transition-shadow hover:shadow-md">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{String(p[d.pc.nome] ?? "Projeto")}</p>
                            <p className="truncate text-xs text-muted-foreground">{cli ? nomePessoa(cli) : "Sem cliente"}</p>
                            {nomeGestor(d, p) && <p className="truncate text-xs text-muted-foreground">Gestor: {nomeGestor(d, p)}</p>}
                          </div>
                          <div className="flex opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                            {perms.canUpdate && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setForm(p)} aria-label="Editar"><Pencil className="h-3.5 w-3.5" /></Button>}
                            {perms.canDelete && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => excluir(p)} aria-label="Excluir"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
                          </div>
                        </div>
                        <Progress value={pr.pct} className="h-2" />
                        <p className="text-xs text-muted-foreground">{pr.ok} de {pr.total} tarefas concluídas · {pr.pct}%</p>
                      </div>
                    );
  }

  return (
    <div className="space-y-4">
      <Dialog open={!!apagar} onOpenChange={(v) => { if (!v) setApagar(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir projeto</DialogTitle>
            <DialogDescription>
              Esta ação apaga o projeto e todas as suas tarefas, checklists, dependências e anexos. Não pode ser desfeita.
              Para confirmar, digite o nome do projeto: <strong className="text-foreground">{nomeApagar}</strong>
            </DialogDescription>
          </DialogHeader>
          <Input autoFocus value={confirmaNome} onChange={(e) => setConfirmaNome(e.target.value)} placeholder="Nome do projeto" aria-label="Nome do projeto" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setApagar(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={apagando || confirmaNome.trim() !== nomeApagar.trim()} onClick={confirmarExclusao}>
              {apagando ? "Excluindo…" : "Excluir projeto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">{espacoNome || "Projetos"}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => setStatusOpen(true)} aria-label="Gerenciar status" title="Gerenciar status">
            <Settings className="h-4 w-4" />
          </Button>
          <Button asChild variant="outline"><Link to="/projetos/templates"><ListChecks className="mr-1 h-4 w-4" />Templates</Link></Button>
          {perms.canCreate && <Button onClick={() => setForm("new")}><Plus className="mr-1 h-4 w-4" />Novo projeto</Button>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Pesquisar por projeto ou cliente…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-md" />
        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Modo de visualização">
          <Button size="sm" variant={modo === "lista" ? "secondary" : "ghost"} onClick={() => setModo("lista")} aria-pressed={modo === "lista"}><List className="mr-1 h-4 w-4" />Lista</Button>
          <Button size="sm" variant={modo === "kanban" ? "secondary" : "ghost"} onClick={() => setModo("kanban")} aria-pressed={modo === "kanban"}><Columns3 className="mr-1 h-4 w-4" />Kanban</Button>
        </div>
      </div>
      {d.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!d.isLoading && grupos.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhum status para este espaço. Use a engrenagem para criar os status (ex.: Não iniciado, Em produção).
        </p>
      )}
      {modo === "kanban" && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {grupos.map((g) => (
            <section key={g.id} className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-card"
              onDragOver={(e) => { if (arrastando) e.preventDefault(); }}
              onDrop={() => { if (arrastando) moverStatus(arrastando, g.id); setArrastando(null); }}>
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <span className="h-3 w-3 rounded-full border border-border" style={{ background: g.cor || "transparent" }} />
                <span className="truncate font-semibold text-foreground">{g.nome}</span>
                <Badge variant="secondary" className="ml-auto">{g.itens.length}</Badge>
              </div>
              <div className="flex min-h-24 flex-col gap-2 p-2">
                {g.itens.map((p) => cardProjeto(p))}
                {g.itens.length === 0 && <p className="p-2 text-center text-xs text-muted-foreground">Nenhum projeto</p>}
              </div>
            </section>
          ))}
        </div>
      )}
      {modo === "lista" && <div className="space-y-3">
        {grupos.map((g) => {
          const closed = fechados.has(g.id);
          return (
            <section key={g.id} className="rounded-lg border border-border bg-card">
              <button
                className="flex w-full items-center gap-2 px-4 py-3 text-left"
                onClick={() => setFechados((s) => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })}
              >
                {closed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <span className="h-3 w-3 rounded-full border border-border" style={{ background: g.cor || "transparent" }} />
                <span className="font-semibold text-foreground">{g.nome}</span>
                <Badge variant="secondary">{g.itens.length}</Badge>
              </button>
              {!closed && (
                <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-2 xl:grid-cols-3">
                  {g.itens.map((p) => cardProjeto(p))}
                  {g.itens.length === 0 && <p className="text-sm text-muted-foreground">Nenhum projeto neste status.</p>}
                </div>
              )}
            </section>
          );
        })}
      </div>}
      <StatusDialog open={statusOpen} onOpenChange={setStatusOpen} perms={perms} projetos={d.projetos} statusCol={d.pc.status} espacoId={espacoId} espacoNome={espacoNome} />
      {form && <ProjetoDialog d={d} espacoId={espacoId} original={form === "new" ? null : form} onClose={() => setForm(null)} />}
    </div>
  );
}

function ProjetoDialog({ d, espacoId, original, onClose }: { d: D; espacoId: string | null; original: Row | null; onClose: () => void }) {
  const espacosFolha = d.espacos.filter((e) => !d.espacos.some((x) => String(x["espaco_pai_id"] ?? "") === String(rowId(e))));
  const inicialEspRaw = original ? (original["espaco_id"] ? String(original["espaco_id"]) : "") : (espacoId ?? "");
  const inicialEsp = espacosFolha.some((e) => String(rowId(e)) === inicialEspRaw) ? inicialEspRaw : "";
  const [espSel, setEspSel] = useState<string>(inicialEsp);
  const statusLista = statusDoEspaco(d, espSel || null);
  const [templateId, setTemplateId] = useState("none");
  const qc = useQueryClient();
  const { stamp } = useAudit();
  const [f, setF] = useState<Row>(original ? { ...original } : {});
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const clientes = d.parceiros.filter((p) => p["is_cliente"] !== false);
  const espacoOpts = espacosFolha.map((e) => {
    const nomes = cadeiaEspaco(d.espacos, String(rowId(e))).reverse()
      .map((id) => String(d.espacos.find((x) => String(rowId(x)) === id)?.["nome"] ?? ""));
    return { value: String(rowId(e)), label: nomes.join(" › ") };
  }).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  function trocarEspaco(v: string) {
    setEspSel(v);
    const novos = statusDoEspaco(d, v || null);
    if (!novos.some((s) => String(rowId(s)) === String(f[d.pc.status] ?? ""))) set(d.pc.status, "");
  }

  async function salvar() {
    if (!String(f[d.pc.nome] ?? "").trim()) { toast.error("Informe o nome do projeto."); return; }
    if (!espSel) { toast.error("Escolha o espaço do projeto."); return; }
    if (!String(f[d.pc.parceiro] ?? "").trim()) { toast.error("Escolha o cliente do projeto."); return; }
    const v: Row = { [d.pc.nome]: f[d.pc.nome], [d.pc.status]: f[d.pc.status] || null, [d.pc.parceiro]: f[d.pc.parceiro] || null, [d.pc.ini]: f[d.pc.ini] || null, [d.pc.fim]: f[d.pc.fim] || null };
    if (d.pc.descricao !== d.pc.nome) v[d.pc.descricao] = f[d.pc.descricao] ?? null;
    v["espaco_id"] = espSel;
    v["gestor_id"] = f["gestor_id"] || null;
    const payload = filterPayload(stamp(v, !original), d.pCols);
    if (original) {
      const { error } = await supabase.from("projetos").update(payload as never).eq(idColumn(original), rowId(original) as never);
      if (error) { console.error(error); toast.error(error.message); return; }
    } else {
      const { data: criado, error } = await supabase.from("projetos").insert(payload as never).select().maybeSingle();
      if (error) { console.error(error); toast.error(error.message); return; }
      if (templateId !== "none" && criado) {
        const n = await aplicarTemplate(d, templateId, rowId(criado as Row), 0, stamp);
        if (n > 0) toast.success(`${n} tarefa(s) do template criadas.`);
        qc.invalidateQueries({ queryKey: ["table", "projetos_tarefas"] });
      }
    }
    toast.success("Projeto salvo.");
    qc.invalidateQueries({ queryKey: ["table", "projetos"] });
    onClose();
  }

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b p-6">
          <SheetTitle>{original ? "Editar projeto" : "Novo projeto"}</SheetTitle>
          <SheetDescription>Nome, cliente, gestor, status e período do projeto.</SheetDescription>
        </SheetHeader>
        <div className="grid flex-1 content-start gap-4 overflow-y-auto p-6 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label>Nome</Label><Input value={String(f[d.pc.nome] ?? "")} onChange={(e) => set(d.pc.nome, e.target.value)} /></div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Espaço *</Label>
            <SearchSelect value={espSel} onChange={(v) => trocarEspaco(v)} placeholder="Selecione o espaço" options={espacoOpts} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Cliente *</Label>
            <SearchSelect value={String(f[d.pc.parceiro] ?? "")} onChange={(v) => set(d.pc.parceiro, v)} placeholder="Selecione o cliente"
              options={clientes.map((c) => ({ value: String(rowId(c)), label: nomePessoa(c) }))} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Gestor do projeto</Label>
            <SearchSelect value={String(f["gestor_id"] ?? "")} onChange={(v) => set("gestor_id", v)} placeholder="Selecione o gestor"
              options={d.usuarios.filter((u) => u["status"] !== false).map((u) => ({ value: String(rowId(u)), label: String(u["nome"] ?? u["email"] ?? "") }))} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Status</Label>
            <Select value={String(f[d.pc.status] ?? "") || "none"} onValueChange={(v) => set(d.pc.status, v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Sem status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem status</SelectItem>
                {[...statusLista].sort((a, b) => Number(a[d.sc.ordem] ?? 0) - Number(b[d.sc.ordem] ?? 0)).map((s) => (
                  <SelectItem key={String(rowId(s))} value={String(rowId(s))}>{String(s[d.sc.nome] ?? "")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!original && d.templates.length > 0 && (
            <div className="space-y-1 sm:col-span-2">
              <Label>Aplicar Template de Tarefas</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {d.templates.map((t) => <SelectItem key={String(rowId(t))} value={String(rowId(t))}>{String(t["nome"] ?? "")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1"><Label>Dt Início</Label><Input type="date" value={String(f[d.pc.ini] ?? "").slice(0, 10)} onChange={(e) => set(d.pc.ini, e.target.value)} /></div>
          <div className="space-y-1"><Label>Dt Fim</Label><Input type="date" value={String(f[d.pc.fim] ?? "").slice(0, 10)} onChange={(e) => set(d.pc.fim, e.target.value)} /></div>
          {d.pc.descricao !== d.pc.nome && (
            <div className="space-y-1 sm:col-span-2"><Label>Descrição</Label><Textarea rows={3} value={String(f[d.pc.descricao] ?? "")} onChange={(e) => set(d.pc.descricao, e.target.value)} /></div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar}>Salvar</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Detalhe({ projeto, d, perms, onBack }: { projeto: Row; d: D; perms: Perms; onBack: () => void }) {
  const { stamp, empresaId } = useAudit();
  function imprimir() {
    const html = document.documentElement;
    html.classList.add("prj-printing");
    const off = () => { html.classList.remove("prj-printing"); window.removeEventListener("afterprint", off); };
    window.addEventListener("afterprint", off);
    window.print();
  }
  const qc = useQueryClient();
  const pid = String(rowId(projeto));
  const tarefas = d.tarefas.filter((t) => String(t[d.tc.projeto]) === pid)
    .sort((a, b) => (Number(a["ordem"]) || 0) - (Number(b["ordem"]) || 0));
  const [aberta, setAberta] = useState<string | null>(null);
  const tIds = new Set(tarefas.map((t) => String(rowId(t))));
  const ativs = d.atividades.filter((a) => tIds.has(String(a["tarefa_id"])))
    .sort((a, b) => (Number(a["ordem"]) || 0) - (Number(b["ordem"]) || 0));
  const ativsDe = (tid: string) => ativs.filter((a) => String(a["tarefa_id"]) === tid);
  // Tarefas expandidas (padrão: todas recolhidas).
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const todasAbertas = tarefas.length > 0 && tarefas.every((t) => expandidas.has(String(rowId(t))));
  const [ativAberta, setAtivAberta] = useState<{ id: string | null; tarefa: string } | null>(null);
  const atividadeAberta = ativAberta?.id ? ativs.find((a) => String(rowId(a)) === ativAberta.id) ?? null : null;
  async function excluirAtividade(a: Row) {
    if (!await confirmar(`Excluir a atividade "${a["nome"]}"?`)) return;
    const { error } = await supabase.from(ATIVIDADES as never).delete().eq("id", rowId(a) as never);
    if (error) { toast.error(error.message); return; }
    await sincronizarTarefa(String(a["tarefa_id"]), d.tCols);
    qc.invalidateQueries({ queryKey: ["table", ATIVIDADES] });
    refresh();
  }
  async function concluirAtividade(a: Row, v: boolean) {
    const { error } = await supabase.from(ATIVIDADES as never).update({ progresso: v ? 100 : 0, situacao: v ? "Concluída" : "Em andamento" } as never).eq("id", rowId(a) as never);
    if (error) { toast.error(error.message); return; }
    await sincronizarTarefa(String(a["tarefa_id"]), d.tCols);
    qc.invalidateQueries({ queryKey: ["table", ATIVIDADES] });
    refresh();
  }
  const [nova, setNova] = useState(false);
  const [busca, setBusca] = useState("");
  const pr = progresso(d, pid);
  const cli = d.parceiros.find((x) => String(rowId(x)) === String(projeto[d.pc.parceiro]));
  const tarefaAberta = tarefas.find((t) => String(rowId(t)) === aberta) ?? null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["table", "projetos_tarefas"] });

  const podeArrastar = perms.canUpdate && !busca.trim();
  async function reordenar(novo: Row[]) {
    const pos = new Map(novo.map((r, i) => [String(rowId(r)), i]));
    qc.setQueryData<Row[]>(["table", "projetos_tarefas"], (old = []) =>
      old.map((r) => (pos.has(String(rowId(r))) ? { ...r, ordem: pos.get(String(rowId(r))) } : r)));
    try { await salvarOrdem("projetos_tarefas", novo); }
    catch (e) { toast.error((e as Error).message); refresh(); }
  }

  const [importando, setImportando] = useState(false);
  const [escolherTpl, setEscolherTpl] = useState(false);
  const [tplImport, setTplImport] = useState("");
  async function importarPadrao() {
    if (!tplImport) { toast.error("Escolha um template."); return; }
    setImportando(true);
    try {
      const base = tarefas.reduce((mx, t) => Math.max(mx, Number(t["ordem"] ?? -1) || 0), -1) + 1;
      const n = await aplicarTemplate(d, tplImport, rowId(projeto), base, stamp);
      if (n > 0) { toast.success(`${n} tarefa(s) importada(s).`); setEscolherTpl(false); }
      await refresh();
    } finally { setImportando(false); }
  }
  async function patch(t: Row, v: Row) {
    const { error } = await supabase.from("projetos_tarefas").update(filterPayload(v, d.tCols)).eq(idColumn(t), rowId(t) as never);
    if (error) { toast.error(error.message); return; }
    refresh();
  }
  async function duplicarTar(t: Row) {
    try {
      await duplicarTarefa(t, d.tc.nome, tarefas.reduce((mx, x) => Math.max(mx, Number(x["ordem"] ?? 0)), -1) + 1);
      toast.success("Tarefa duplicada com as atividades.");
      qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function duplicarAtiv(a: Row) {
    try {
      await duplicarAtividade(a, String(a["tarefa_id"]));
      await sincronizarTarefa(String(a["tarefa_id"]), d.tCols);
      toast.success("Atividade duplicada.");
      qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); }
  }
  async function moverAtividade(lista: Row[], idx: number, dir: -1 | 1) {
    const novo = [...lista];
    const [x] = novo.splice(idx, 1);
    novo.splice(idx + dir, 0, x!);
    const pos = new Map(novo.map((r, i) => [String(rowId(r)), i]));
    qc.setQueryData<Row[]>(["table", ATIVIDADES], (old = []) => old.map((r) => (pos.has(String(rowId(r))) ? { ...r, ordem: pos.get(String(rowId(r))) } : r)));
    try { await salvarOrdem(ATIVIDADES, novo); } catch (e) { toast.error((e as Error).message); qc.invalidateQueries({ queryKey: ["table", ATIVIDADES] }); }
  }
  async function excluir(t: Row) {
    const n = ativsDe(String(rowId(t))).length;
    if (!await confirmar(`Excluir a tarefa "${t[d.tc.nome]}"${n ? ` e suas ${n} atividade(s)` : ""}?`)) return;
    try { await excluirTarefaComFilhos(String(rowId(t))); } catch (e) { toast.error((e as Error).message); return; }
    toast.success("Tarefa excluída.");
    qc.invalidateQueries({ queryKey: ["table", ATIVIDADES] });
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold text-foreground">{String(projeto[d.pc.nome] ?? "Projeto")}</h1>
          <p className="text-sm text-muted-foreground">{cli ? nomePessoa(cli) : "Sem cliente"}{nomeGestor(d, projeto) ? ` · Gestor: ${nomeGestor(d, projeto)}` : ""}{periodo(projeto[d.pc.ini], projeto[d.pc.fim]) ? ` · ${periodo(projeto[d.pc.ini], projeto[d.pc.fim])}` : ""}</p>
        </div>
        <Button variant="outline" onClick={imprimir}><Printer className="mr-1 h-4 w-4" />Imprimir / Exportar PDF</Button>
        <Button variant="outline" onClick={() => compartilhar(projeto)}><Share2 className="mr-1 h-4 w-4" />Compartilhar</Button>
        <ProjetoPrint projeto={projeto} cliente={cli ? nomePessoa(cli) : "Sem cliente"} periodo={periodo(projeto[d.pc.ini], projeto[d.pc.fim])}
          tarefas={tarefas} atividades={ativs} gestor={nomeGestor(d, projeto)} usuarios={d.usuarios} empresaId={empresaId} pct={pr.pct}
          cols={{ nome: d.tc.nome, ini: d.tc.ini, fim: d.tc.fim, prio: d.tc.prio, resp: d.tc.resp, done: d.tc.done }} />
        {perms.canCreate && <Button variant="outline" onClick={() => { setTplImport(d.templates.length === 1 ? String(rowId(d.templates[0]!)) : ""); setEscolherTpl(true); }}><Download className="mr-1 h-4 w-4" />Importar Tarefas Padrão</Button>}
        <Dialog open={escolherTpl} onOpenChange={setEscolherTpl}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Importar tarefas de um template</DialogTitle>
              <DialogDescription>As tarefas do template entram no final da lista, na ordem do template.</DialogDescription>
            </DialogHeader>
            {d.templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum template criado. <Link to="/projetos/templates" className="text-primary underline">Criar templates</Link></p>
            ) : (
              <Select value={tplImport} onValueChange={setTplImport}>
                <SelectTrigger><SelectValue placeholder="Selecione o template" /></SelectTrigger>
                <SelectContent>{d.templates.map((t) => <SelectItem key={String(rowId(t))} value={String(rowId(t))}>{String(t["nome"] ?? "")}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEscolherTpl(false)}>Cancelar</Button>
              <Button onClick={importarPadrao} disabled={importando || !tplImport}>{importando ? "Importando…" : "Importar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {perms.canCreate && <Button onClick={() => setNova(true)}><Plus className="mr-1 h-4 w-4" />Nova tarefa</Button>}
      </div>
      <div className="flex items-center gap-3">
        <Progress value={pr.pct} className="h-2 max-w-sm" />
        <span className="text-sm text-muted-foreground">{pr.ok}/{pr.total} · {pr.pct}%</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Pesquisar tarefa…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-md" />
        <Button variant="outline" disabled={tarefas.length === 0}
          onClick={() => setExpandidas(todasAbertas ? new Set() : new Set(tarefas.map((t) => String(rowId(t)))))}>
          {todasAbertas ? <><ChevronsDownUp className="mr-1 h-4 w-4" />Recolher todas</> : <><ChevronsUpDown className="mr-1 h-4 w-4" />Expandir todas</>}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="w-10" />
              <TableHead>Nome da Tarefa</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Dt Início</TableHead>
              <TableHead>Dt Fim</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <SortableList rows={tarefas} onReorder={reordenar}>
          <TableBody>
            {tarefas.filter((t) => matches(t[d.tc.nome], busca)).map((t) => {
              const id = String(rowId(t));
              const done = isDone(t[d.tc.done]);
              const filhas = ativsDe(id);
              const fechada = !expandidas.has(id);
              return (
                <Fragment key={id}>
                <SortRow key={id} id={id} disabled={!podeArrastar} onClick={() => setAberta(id)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox disabled={!perms.canUpdate || filhas.length > 0} checked={done} onCheckedChange={(v) => patch(t, { [d.tc.done]: doneValue(d.tc.done, v === true), progresso: v === true ? 100 : 0 })} aria-label="Concluída" />
                  </TableCell>
                  <TableCell className="font-medium" style={done ? { color: "var(--progress-100)" } : undefined}>
                    <div className="flex items-center gap-1">
                      <button type="button" className="rounded p-0.5 hover:bg-muted" aria-label={fechada ? "Expandir" : "Recolher"}
                        onClick={(e) => { e.stopPropagation(); setExpandidas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }}>
                        {fechada ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      <span>{String(t[d.tc.nome] ?? "")}</span>
                      <Badge variant="secondary" className="ml-1 text-[10px]">{filhas.length} ativ.</Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-2"><Progress value={tarefaPct(t, d.tc.done)} indicatorColor={progressoCor(tarefaPct(t, d.tc.done))} className="h-1 w-24 bg-muted" /><span className="text-xs text-muted-foreground">{tarefaPct(t, d.tc.done)}%</span></div>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <ResponsaveisPicker disabled={!perms.canUpdate} usuarios={d.usuarios} value={responsaveisDe(t, d.tc.resp)} onChange={(v) => patch(t, { responsaveis: v, [d.tc.resp]: v[0] ?? null })} />
                  </TableCell>
                  <TableCell>{fmtDate(t[d.tc.ini])}</TableCell>
                  <TableCell>{fmtDate(t[d.tc.fim])}</TableCell>
                  <TableCell><Badge className={prioridadeClass(t[d.tc.prio])}>{String(t[d.tc.prio] ?? "Normal")}</Badge></TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <AcoesTarefa
                      onNovaAtividade={perms.canCreate ? () => { setExpandidas((s) => new Set(s).add(id)); setAtivAberta({ id: null, tarefa: id }); } : undefined}
                      onEditar={() => setAberta(id)}
                      onDuplicar={perms.canCreate ? () => void duplicarTar(t) : undefined}
                      onExcluir={perms.canDelete ? () => void excluir(t) : undefined} />
                  </TableCell>
                </SortRow>
                {!fechada && filhas.map((a, idx) => {
                  const aid = String(rowId(a));
                  const ap = atividadePct(a);
                  const ok = ap >= 100;
                  return (
                    <TableRow key={aid} className="cursor-pointer bg-muted/20" onClick={() => setAtivAberta({ id: aid, tarefa: id })}>
                      <TableCell />
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox disabled={!perms.canUpdate} checked={ok} onCheckedChange={(v) => concluirAtividade(a, v === true)} aria-label="Atividade concluída" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 pl-7 text-sm" style={ok ? { color: "var(--progress-100)" } : undefined}>
                          <span className="text-muted-foreground">↳</span>{String(a["nome"] ?? "")}
                        </div>
                        <div className="mt-1 flex items-center gap-2 pl-11"><Progress value={ap} indicatorColor={progressoCor(ap)} className="h-1 w-20 bg-muted" /><span className="text-xs text-muted-foreground">{ap}%</span></div>
                      </TableCell>
                      <TableCell><IniciaisResponsaveis ids={Array.isArray(a["responsaveis"]) ? (a["responsaveis"] as unknown[]).map(String) : []} usuarios={d.usuarios} /></TableCell>
                      <TableCell className="text-sm">{fmtDate(a["dt_inicio"])}</TableCell>
                      <TableCell className="text-sm">{fmtDate(a["dt_fim"])}</TableCell>
                      <TableCell><Badge className={prioridadeClass(a["prioridade"])}>{String(a["prioridade"] ?? "Normal")}</Badge></TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {perms.canUpdate && !busca.trim() && <>
                          <Button size="icon" variant="ghost" disabled={idx === 0} onClick={() => moverAtividade(filhas, idx, -1)} aria-label="Subir atividade" title="Subir"><ArrowUp className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" disabled={idx === filhas.length - 1} onClick={() => moverAtividade(filhas, idx, 1)} aria-label="Descer atividade" title="Descer"><ArrowDown className="h-4 w-4" /></Button>
                        </>}
                        <AcoesTarefa rotulo="atividade"
                          onEditar={() => setAtivAberta({ id: aid, tarefa: id })}
                          onDuplicar={perms.canCreate ? () => void duplicarAtiv(a) : undefined}
                          onExcluir={perms.canDelete ? () => void excluirAtividade(a) : undefined} />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!fechada && filhas.length === 0 && (
                  <TableRow className="bg-muted/10"><TableCell colSpan={8} className="py-2 pl-16 text-xs text-muted-foreground">Nenhuma atividade. Use o botão + para adicionar.</TableCell></TableRow>
                )}
                </Fragment>
              );
            })}
            {tarefas.length === 0 && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhuma tarefa neste projeto.</TableCell></TableRow>
            )}
          </TableBody>
          </SortableList>
        </Table>
      </div>
      <TarefaSheet tarefa={tarefaAberta} isNew={nova} tarefasDoProjeto={tarefas} projetoId={pid} perms={perms}
        onClose={() => { setAberta(null); setNova(false); }} />
      <AtividadeSheet atividade={atividadeAberta} isNew={Boolean(ativAberta && !ativAberta.id)} tarefaId={ativAberta?.tarefa ?? ""}
        projetoId={pid} atividadesDoProjeto={ativs} tCols={d.tCols} perms={perms} onClose={() => setAtivAberta(null)} />
    </div>
  );
}

function SortRow({ id, disabled, onClick, children }: { id: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  const { setNodeRef, style, handle } = useSortableRow(id, disabled);
  return (
    <TableRow ref={setNodeRef} style={style} className="cursor-pointer bg-background" onClick={onClick}>
      <TableCell className="w-8 px-2" onClick={(e) => e.stopPropagation()}>{handle}</TableCell>
      {children}
    </TableRow>
  );
}

/** Cria no projeto as tarefas do template, na ordem do template. Retorna quantas foram criadas. */
async function aplicarTemplate(d: D, templateId: string, projetoId: unknown, base: number, stamp: (v: Row, isNew: boolean) => Row): Promise<number> {
  const { data, error } = await supabase.from(TAREFAS_PADRAO).select("*").eq("template_id", templateId as never).order("ordem", { ascending: true });
  if (error) { console.error(error); toast.error(error.message); return 0; }
  const modelos = (data ?? []) as Row[];
  if (!modelos.length) { toast.error("Este template não tem tarefas."); return 0; }
  const hoje = new Date();
  const iso = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const novas = modelos.map((m, idx) => {
    const fim = new Date(hoje);
    fim.setDate(fim.getDate() + diasDoModelo(m));
    return filterPayload(stamp({
      [d.tc.projeto]: projetoId, [d.tc.nome]: m["nome"], descricao: m["descricao"] ?? null,
      [d.tc.prio]: m["prioridade"] ?? "Normal", [d.tc.ini]: iso(hoje), [d.tc.fim]: iso(fim),
      ordem: base + idx,
    }, true), d.tCols);
  });
  const { error: e2 } = await supabase.from("projetos_tarefas").insert(novas as never);
  if (e2) { console.error(e2); toast.error(e2.message); return 0; }
  return novas.length;
}
