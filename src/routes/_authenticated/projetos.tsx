import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronRight, Pencil, Plus, Settings, Share2, Trash2, ListChecks, Download, List, Columns3 } from "lucide-react";

async function compartilhar(projeto: Row) {
  let token = projeto["token_compartilhamento"] as string | null | undefined;
  if (!token) {
    token = crypto.randomUUID();
    const { error } = await supabase.from("projetos").update({ token_compartilhamento: token } as never).eq(idColumn(projeto), rowId(projeto) as never);
    if (error) { toast.error(error.message); return; }
  }
  const url = `${window.location.origin}/compartilhado/${token}`;
  try { await navigator.clipboard.writeText(url); toast.success("Link do cliente copiado!", { description: url }); }
  catch { window.prompt("Copie o link do cliente:", url); }
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { StatusDialog } from "@/components/projetos/StatusDialog";
import { TarefasPadraoDialog, TAREFAS_PADRAO } from "@/components/projetos/TarefasPadraoDialog";
import { TarefaSheet } from "@/components/projetos/TarefaSheet";
import { useTableRows, rowId, idColumn, matches } from "@/lib/crud";
import { SortableList, salvarOrdem, useSortableRow } from "@/lib/reorder";
import { useAudit } from "@/lib/audit";
import { usePagePermissions, type Perms } from "@/hooks/usePagePermissions";
import { C, doneValue, filterPayload, fmtDate, isDone, nomePessoa, prioridadeClass, progressoCor, resolveCol, tarefaPct, useCols } from "@/lib/projetos";
import type { Row } from "@/lib/row";

export const Route = createFileRoute("/_authenticated/projetos")({
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
  return { status, projetos, tarefas, parceiros, usuarios, pCols, tCols, pc, tc, sc, isLoading };
}

function ProjetosPage() {
  const perms = usePagePermissions("/projetos");
  const d = useProjetoData();
  const [selId, setSelId] = useState<string | null>(null);
  const sel = d.projetos.find((p) => String(rowId(p)) === selId);
  if (sel) return <Detalhe projeto={sel} d={d} perms={perms} onBack={() => setSelId(null)} />;
  return <Painel d={d} perms={perms} onOpen={(id) => setSelId(id)} />;
}

type D = ReturnType<typeof useProjetoData>;

function progresso(d: D, projetoId: string) {
  const ts = d.tarefas.filter((t) => String(t[d.tc.projeto]) === projetoId);
  const ok = ts.filter((t) => tarefaPct(t, d.tc.done) >= 100).length;
  const soma = ts.reduce((a, t) => a + tarefaPct(t, d.tc.done), 0);
  return { total: ts.length, ok, pct: ts.length ? Math.round(soma / ts.length) : 0 };
}

function Painel({ d, perms, onOpen }: { d: D; perms: Perms; onOpen: (id: string) => void }) {
  const [busca, setBusca] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [form, setForm] = useState<Row | null | "new">(null);
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const qc = useQueryClient();

  const grupos = useMemo(() => {
    const ordered = [...d.status].sort((a, b) => Number(a[d.sc.ordem] ?? 0) - Number(b[d.sc.ordem] ?? 0));
    const filtered = d.projetos.filter((p) => {
      const cli = nomePessoa(d.parceiros.find((x) => String(rowId(x)) === String(p[d.pc.parceiro])));
      return matches(`${p[d.pc.nome] ?? ""} ${cli}`, busca);
    });
    const ids = new Set(ordered.map((s) => String(rowId(s))));
    const g = ordered.map((s) => ({
      id: String(rowId(s)), nome: String(s[d.sc.nome] ?? ""), cor: String(s[d.sc.cor] ?? ""),
      itens: filtered.filter((p) => String(p[d.pc.status] ?? "") === String(rowId(s))),
    }));
    const sem = filtered.filter((p) => !ids.has(String(p[d.pc.status] ?? "")));
    if (sem.length) g.push({ id: "__sem", nome: "Sem status", cor: "", itens: sem });
    return g;
  }, [d, busca]);

  const [padraoOpen, setPadraoOpen] = useState(false);
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
    if (!p || statusId === "__sem" || String(p[d.pc.status] ?? "") === statusId) return;
    qc.setQueryData<Row[]>(["table", "projetos"], (old = []) => old.map((x) => (String(rowId(x)) === projetoId ? { ...x, [d.pc.status]: statusId } : x)));
    const { error } = await supabase.from("projetos").update({ [d.pc.status]: statusId } as never).eq(idColumn(p), rowId(p) as never);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["table", "projetos"] });
  }
  function cardProjeto(p: Row) {
                    const id = String(rowId(p));
                    const pr = progresso(d, id);
                    const cli = d.parceiros.find((x) => String(rowId(x)) === String(p[d.pc.parceiro]));
                    return (
                      <div key={id} role="button" draggable={modo === "kanban" && perms.canUpdate} onDragStart={() => setArrastando(id)} onDragEnd={() => setArrastando(null)} tabIndex={0} onClick={() => onOpen(id)} onKeyDown={(e) => e.key === "Enter" && onOpen(id)}
                        className="group cursor-pointer space-y-2 rounded-md border border-border bg-background p-3 transition-shadow hover:shadow-md">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{String(p[d.pc.nome] ?? "Projeto")}</p>
                            <p className="truncate text-xs text-muted-foreground">{cli ? nomePessoa(cli) : "Sem cliente"}</p>
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
        <h1 className="text-2xl font-bold text-foreground">Projetos</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => setStatusOpen(true)} aria-label="Gerenciar status" title="Gerenciar status">
            <Settings className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setPadraoOpen(true)}><ListChecks className="mr-1 h-4 w-4" />Tarefas Padrão</Button>
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
          Nenhum status cadastrado. Use a engrenagem para criar os status (ex.: Não iniciado, Em produção).
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
      <TarefasPadraoDialog open={padraoOpen} onOpenChange={setPadraoOpen} perms={perms} />
      <StatusDialog open={statusOpen} onOpenChange={setStatusOpen} perms={perms} projetos={d.projetos} statusCol={d.pc.status} />
      {form && <ProjetoDialog d={d} original={form === "new" ? null : form} onClose={() => setForm(null)} />}
    </div>
  );
}

function ProjetoDialog({ d, original, onClose }: { d: D; original: Row | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { stamp } = useAudit();
  const [f, setF] = useState<Row>(original ? { ...original } : {});
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const clientes = d.parceiros.filter((p) => p["is_cliente"] !== false);

  async function salvar() {
    if (!String(f[d.pc.nome] ?? "").trim()) { toast.error("Informe o nome do projeto."); return; }
    const v: Row = { [d.pc.nome]: f[d.pc.nome], [d.pc.status]: f[d.pc.status] || null, [d.pc.parceiro]: f[d.pc.parceiro] || null, [d.pc.ini]: f[d.pc.ini] || null, [d.pc.fim]: f[d.pc.fim] || null };
    if (d.pc.descricao !== d.pc.nome) v[d.pc.descricao] = f[d.pc.descricao] ?? null;
    const payload = filterPayload(stamp(v, !original), d.pCols);
    const { error } = original
      ? await supabase.from("projetos").update(payload).eq(idColumn(original), rowId(original) as never)
      : await supabase.from("projetos").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Projeto salvo.");
    qc.invalidateQueries({ queryKey: ["table", "projetos"] });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{original ? "Editar projeto" : "Novo projeto"}</DialogTitle>
          <DialogDescription>Nome, cliente, status e período do projeto.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label>Nome</Label><Input value={String(f[d.pc.nome] ?? "")} onChange={(e) => set(d.pc.nome, e.target.value)} /></div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Cliente</Label>
            <SearchSelect value={String(f[d.pc.parceiro] ?? "")} onChange={(v) => set(d.pc.parceiro, v)} allowClear placeholder="Selecione o cliente"
              options={clientes.map((c) => ({ value: String(rowId(c)), label: nomePessoa(c) }))} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Status</Label>
            <Select value={String(f[d.pc.status] ?? "")} onValueChange={(v) => set(d.pc.status, v)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {[...d.status].sort((a, b) => Number(a[d.sc.ordem] ?? 0) - Number(b[d.sc.ordem] ?? 0)).map((s) => (
                  <SelectItem key={String(rowId(s))} value={String(rowId(s))}>{String(s[d.sc.nome] ?? "")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Dt Início</Label><Input type="date" value={String(f[d.pc.ini] ?? "").slice(0, 10)} onChange={(e) => set(d.pc.ini, e.target.value)} /></div>
          <div className="space-y-1"><Label>Dt Fim</Label><Input type="date" value={String(f[d.pc.fim] ?? "").slice(0, 10)} onChange={(e) => set(d.pc.fim, e.target.value)} /></div>
          {d.pc.descricao !== d.pc.nome && (
            <div className="space-y-1 sm:col-span-2"><Label>Descrição</Label><Textarea rows={3} value={String(f[d.pc.descricao] ?? "")} onChange={(e) => set(d.pc.descricao, e.target.value)} /></div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Detalhe({ projeto, d, perms, onBack }: { projeto: Row; d: D; perms: Perms; onBack: () => void }) {
  const { stamp } = useAudit();
  const qc = useQueryClient();
  const pid = String(rowId(projeto));
  const tarefas = d.tarefas.filter((t) => String(t[d.tc.projeto]) === pid)
    .sort((a, b) => (Number(a["ordem"]) || 0) - (Number(b["ordem"]) || 0));
  const [aberta, setAberta] = useState<string | null>(null);
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
  async function importarPadrao() {
    setImportando(true);
    try {
      const { data, error } = await supabase.from(TAREFAS_PADRAO).select("*").order("ordem", { ascending: true });
      if (error) { toast.error(error.message); return; }
      const modelos = (data ?? []) as Row[];
      if (!modelos.length) { toast.error("Nenhuma tarefa padrão cadastrada."); return; }
      const hoje = new Date();
      const iso = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      const base = tarefas.reduce((mx, t) => Math.max(mx, Number(t["ordem"] ?? -1) || 0), -1) + 1;
      const novas = modelos.map((m, idx) => {
        const fim = new Date(hoje);
        fim.setDate(fim.getDate() + (Number(m["dias_estimados"]) || 0));
        return filterPayload(stamp({
          [d.tc.projeto]: rowId(projeto), [d.tc.nome]: m["nome"], descricao: m["descricao"] ?? null,
          [d.tc.prio]: m["prioridade"] ?? "Normal", [d.tc.ini]: iso(hoje), [d.tc.fim]: iso(fim),
          ordem: base + (m["ordem"] != null ? Number(m["ordem"]) : idx),
        }, true), d.tCols);
      });
      const { error: e2 } = await supabase.from("projetos_tarefas").insert(novas);
      if (e2) { toast.error(e2.message); return; }
      toast.success(`${novas.length} tarefa(s) importada(s).`);
      await refresh();
    } finally { setImportando(false); }
  }
  async function patch(t: Row, v: Row) {
    const { error } = await supabase.from("projetos_tarefas").update(filterPayload(v, d.tCols)).eq(idColumn(t), rowId(t) as never);
    if (error) { toast.error(error.message); return; }
    refresh();
  }
  async function excluir(t: Row) {
    if (!confirm(`Excluir a tarefa "${t[d.tc.nome]}"?`)) return;
    const { error } = await supabase.from("projetos_tarefas").delete().eq(idColumn(t), rowId(t) as never);
    if (error) { toast.error(error.message); return; }
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold text-foreground">{String(projeto[d.pc.nome] ?? "Projeto")}</h1>
          <p className="text-sm text-muted-foreground">{cli ? nomePessoa(cli) : "Sem cliente"} · {fmtDate(projeto[d.pc.ini])} a {fmtDate(projeto[d.pc.fim])}</p>
        </div>
        <Button variant="outline" onClick={() => compartilhar(projeto)}><Share2 className="mr-1 h-4 w-4" />Compartilhar</Button>
        {perms.canCreate && <Button variant="outline" onClick={importarPadrao} disabled={importando}><Download className="mr-1 h-4 w-4" />{importando ? "Importando…" : "Importar Tarefas Padrão"}</Button>}
        {perms.canCreate && <Button onClick={() => setNova(true)}><Plus className="mr-1 h-4 w-4" />Nova tarefa</Button>}
      </div>
      <div className="flex items-center gap-3">
        <Progress value={pr.pct} className="h-2 max-w-sm" />
        <span className="text-sm text-muted-foreground">{pr.ok}/{pr.total} · {pr.pct}%</span>
      </div>
      <Input placeholder="Pesquisar tarefa…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-md" />
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
              return (
                <SortRow key={id} id={id} disabled={!podeArrastar} onClick={() => setAberta(id)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox disabled={!perms.canUpdate} checked={done} onCheckedChange={(v) => patch(t, { [d.tc.done]: doneValue(d.tc.done, v === true), progresso: v === true ? 100 : 0 })} aria-label="Concluída" />
                  </TableCell>
                  <TableCell className={done ? "text-muted-foreground line-through" : "font-medium"}>
                    {String(t[d.tc.nome] ?? "")}
                    <div className="mt-1 flex items-center gap-2"><Progress value={tarefaPct(t, d.tc.done)} indicatorColor={progressoCor(tarefaPct(t, d.tc.done))} className="h-1 w-24 bg-muted" /><span className="text-xs text-muted-foreground">{tarefaPct(t, d.tc.done)}%</span></div>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select disabled={!perms.canUpdate} value={String(t[d.tc.resp] ?? "none")} onValueChange={(v) => patch(t, { [d.tc.resp]: v === "none" ? null : v })}>
                      <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem responsável</SelectItem>
                        {d.usuarios.map((u) => <SelectItem key={String(rowId(u))} value={String(rowId(u))}>{nomePessoa(u)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>{fmtDate(t[d.tc.ini])}</TableCell>
                  <TableCell>{fmtDate(t[d.tc.fim])}</TableCell>
                  <TableCell><Badge className={prioridadeClass(t[d.tc.prio])}>{String(t[d.tc.prio] ?? "Normal")}</Badge></TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" onClick={() => setAberta(id)} aria-label="Abrir"><Pencil className="h-4 w-4" /></Button>
                    {perms.canDelete && <Button size="icon" variant="ghost" onClick={() => excluir(t)} aria-label="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                  </TableCell>
                </SortRow>
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
