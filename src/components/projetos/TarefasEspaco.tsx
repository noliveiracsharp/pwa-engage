import { Fragment, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, List, Columns3, Settings, ListChecks } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { StatusDialog } from "@/components/projetos/StatusDialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TarefaSheet } from "@/components/projetos/TarefaSheet";
import { AtividadeSheet } from "@/components/projetos/AtividadeSheet";
import { IniciaisResponsaveis, responsaveisDe } from "@/components/projetos/ResponsaveisPicker";
import { espacoEDescendentes } from "@/components/projetos/EspacosSidebar";
import { rowId, idColumn, matches } from "@/lib/crud";
import { useAudit } from "@/lib/audit";
import { ATIVIDADES, atividadePct, filterPayload, fmtDate, prioridadeClass, progressoCor, sincronizarTarefa, tarefaPct } from "@/lib/projetos";
import type { Row } from "@/lib/row";
import type { Perms } from "@/hooks/usePagePermissions";

type Cols = { projeto: string; nome: string; resp: string; ini: string; fim: string; prio: string; done: string };

export function TarefasEspaco({ espacoId, espacos, projetos, tarefas, atividades, statusList, usuarios, tc, statusNome, statusOrdem, statusCor, projetoNome, tCols, perms }: {
  espacoId: string; espacos: Row[]; projetos: Row[]; tarefas: Row[]; atividades: Row[]; statusList: Row[]; usuarios: Row[];
  tc: Cols; statusNome: string; statusOrdem: string; statusCor: string; projetoNome: string; tCols: string[] | undefined; perms: Perms;
}) {
  const qc = useQueryClient();
  const { stamp } = useAudit();
  const [modo, setModo] = useState<"lista" | "kanban">("kanban");
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const [nova, setNova] = useState<string | null>(null); // status da nova tarefa ("" = sem status)
  const [ativAberta, setAtivAberta] = useState<{ id: string | null; tarefa: string } | null>(null);
  const [rapida, setRapida] = useState<Record<string, string>>({});
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const semColunas = !!tCols?.length && !tCols.includes("espaco_id");

  const ids = useMemo(() => espacoEDescendentes(espacos, espacoId), [espacos, espacoId]);
  const projDoEspaco = useMemo(() => new Map(projetos.filter((p) => ids.has(String(p["espaco_id"] ?? ""))).map((p) => [String(rowId(p)), p])), [projetos, ids]);
  const minhas = tarefas.filter((t) => ids.has(String(t["espaco_id"] ?? "")) || (!t["espaco_id"] && projDoEspaco.has(String(t[tc.projeto] ?? ""))))
    .filter((t) => matches(String(t[tc.nome] ?? ""), busca))
    .sort((a, b) => (Number(a["ordem"]) || 0) - (Number(b["ordem"]) || 0));
  const ordenados = [...statusList].sort((a, b) => Number(a[statusOrdem] ?? 0) - Number(b[statusOrdem] ?? 0));
  const sids = new Set(ordenados.map((s) => String(rowId(s))));
  const grupos = [
    ...ordenados.map((s) => ({ id: String(rowId(s)), nome: String(s[statusNome] ?? ""), cor: String(s[statusCor] ?? ""), itens: minhas.filter((t) => String(t["status_id"] ?? "") === String(rowId(s))) })),
    { id: "", nome: "Sem status", cor: "", itens: minhas.filter((t) => !sids.has(String(t["status_id"] ?? ""))) },
  ];
  const ativsDe = (tid: string) => atividades.filter((a) => String(a["tarefa_id"]) === tid).sort((a, b) => (Number(a["ordem"]) || 0) - (Number(b["ordem"]) || 0));
  const tarefaAberta = tarefas.find((t) => String(rowId(t)) === aberta) ?? null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["table", "projetos_tarefas"] });
  const proxOrdem = () => tarefas.reduce((mx, t) => Math.max(mx, Number(t["ordem"] ?? 0) || 0), -1) + 1;

  async function criarRapida(statusId: string) {
    const nome = (rapida[statusId] ?? "").trim();
    if (!nome) return;
    const v = filterPayload(stamp({ [tc.nome]: nome, espaco_id: espacoId, status_id: statusId || null, [tc.prio]: "Normal", ordem: proxOrdem(), responsaveis: [] }, true), tCols);
    const { error } = await supabase.from("projetos_tarefas").insert(v as never);
    if (error) { toast.error(error.message); return; }
    setRapida((r) => ({ ...r, [statusId]: "" }));
    refresh();
  }
  async function moverStatus(tid: string, statusId: string) {
    const t = tarefas.find((x) => String(rowId(x)) === tid);
    if (!t || String(t["status_id"] ?? "") === statusId) return;
    const v: Row = { status_id: statusId || null };
    if (!t["espaco_id"] && !t[tc.projeto]) v["espaco_id"] = espacoId;
    qc.setQueryData<Row[]>(["table", "projetos_tarefas"], (old = []) => old.map((x) => (String(rowId(x)) === tid ? { ...x, ...v } : x)));
    const { error } = await supabase.from("projetos_tarefas").update(v as never).eq(idColumn(t), rowId(t) as never);
    if (error) toast.error(error.message);
    refresh();
  }
  async function excluir(t: Row) {
    if (!confirm(`Excluir a tarefa "${t[tc.nome]}"?`)) return;
    const { error } = await supabase.from("projetos_tarefas").delete().eq(idColumn(t), rowId(t) as never);
    if (error) { toast.error(error.message); return; }
    refresh();
  }
  async function concluirAtividade(a: Row, v: boolean) {
    const { error } = await supabase.from(ATIVIDADES as never).update({ progresso: v ? 100 : 0, situacao: v ? "Concluída" : "Em andamento" } as never).eq("id", rowId(a) as never);
    if (error) { toast.error(error.message); return; }
    await sincronizarTarefa(String(a["tarefa_id"]), tCols);
    qc.invalidateQueries({ queryKey: ["table", ATIVIDADES] });
    refresh();
  }

  const origem = (t: Row) => { const p = projDoEspaco.get(String(t[tc.projeto] ?? "")); return p ? String(p[projetoNome] ?? "") : ""; };

  const card = (t: Row) => {
    const id = String(rowId(t));
    const pct = tarefaPct(t, tc.done);
    const n = ativsDe(id).length;
    return (
      <div key={id} role="button" tabIndex={0} draggable={perms.canUpdate}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setArrastando(id); }} onDragEnd={() => setArrastando(null)}
        onClick={() => setAberta(id)} onKeyDown={(e) => e.key === "Enter" && setAberta(id)}
        className="group cursor-pointer space-y-2 rounded-md border border-border bg-background p-3 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 break-words font-medium text-foreground">{String(t[tc.nome] ?? "")}</p>
          <div className="flex opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            {perms.canCreate && <Button size="icon" variant="ghost" className="h-6 w-6" title="Nova atividade" aria-label="Nova atividade" onClick={() => setAtivAberta({ id: null, tarefa: id })}><Plus className="h-3.5 w-3.5" /></Button>}
            {perms.canDelete && <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Excluir" onClick={() => excluir(t)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
          </div>
        </div>
        {origem(t) && <p className="truncate text-xs text-muted-foreground">Projeto: {origem(t)}</p>}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge className={prioridadeClass(t[tc.prio])}>{String(t[tc.prio] ?? "Normal")}</Badge>
          {t[tc.fim] ? <span>Prazo {fmtDate(t[tc.fim])}</span> : null}
          <span>{n} ativ.</span>
          <span className="ml-auto"><IniciaisResponsaveis ids={responsaveisDe(t, tc.resp)} usuarios={usuarios} /></span>
        </div>
        <div className="flex items-center gap-2"><Progress value={pct} indicatorColor={progressoCor(pct)} className="h-1 flex-1 bg-muted" /><span className="text-xs text-muted-foreground">{pct}%</span></div>
      </div>
    );
  };

  const addRapido = (gid: string) => perms.canCreate && (
    <Input placeholder="+ Adicionar tarefa (Enter)" value={rapida[gid] ?? ""} className="h-8 text-sm"
      onChange={(e) => setRapida((r) => ({ ...r, [gid]: e.target.value }))}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void criarRapida(gid); } }} />
  );

  return (
    <div className="space-y-3">
      {semColunas && (
        <p className="rounded-md border border-warning bg-warning/10 p-3 text-sm text-foreground">
          Para criar tarefas direto no espaço, rode o script <strong>atendeai-tarefas-no-espaco.sql</strong> no SQL Editor.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Pesquisar tarefa…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-md" />
        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Modo de visualização">
          <Button size="sm" variant={modo === "lista" ? "secondary" : "ghost"} onClick={() => setModo("lista")}><List className="mr-1 h-4 w-4" />Lista</Button>
          <Button size="sm" variant={modo === "kanban" ? "secondary" : "ghost"} onClick={() => setModo("kanban")}><Columns3 className="mr-1 h-4 w-4" />Kanban</Button>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="icon" onClick={() => setStatusOpen(true)} aria-label="Gerenciar status" title="Gerenciar status"><Settings className="h-4 w-4" /></Button>
          <Button asChild variant="outline"><Link to="/projetos/templates"><ListChecks className="mr-1 h-4 w-4" />Templates</Link></Button>
          {perms.canCreate && <Button onClick={() => setNova(ordenados[0] ? String(rowId(ordenados[0])) : "")}><Plus className="mr-1 h-4 w-4" />Nova tarefa</Button>}
        </div>
      </div>
      <StatusDialog open={statusOpen} onOpenChange={setStatusOpen} perms={perms} projetos={projetos} statusCol="status_id"
        espacoId={espacoId} espacoNome={String(espacos.find((e) => String(rowId(e)) === espacoId)?.["nome"] ?? "")} />

      {modo === "kanban" ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {grupos.map((g) => (
            <section key={g.id || "sem"} className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-card"
              onDragOver={(e) => { if (arrastando) e.preventDefault(); }}
              onDrop={() => { if (arrastando) void moverStatus(arrastando, g.id); setArrastando(null); }}>
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <span className="h-3 w-3 rounded-full border border-border" style={{ background: g.cor || "transparent" }} />
                <span className="truncate font-semibold text-foreground">{g.nome}</span>
                <Badge variant="secondary" className="ml-auto">{g.itens.length}</Badge>
              </div>
              <div className="flex min-h-24 flex-col gap-2 p-2">
                {g.itens.map(card)}
                {addRapido(g.id)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {grupos.map((g) => {
            const closed = fechados.has(g.id);
            return (
              <section key={g.id || "sem"} className={`rounded-lg border bg-card ${arrastando ? "border-dashed border-primary" : "border-border"}`}
                onDragOver={(e) => { if (arrastando) e.preventDefault(); }}
                onDrop={() => { if (arrastando) void moverStatus(arrastando, g.id); setArrastando(null); }}>
                <button className="flex w-full items-center gap-2 px-4 py-3 text-left"
                  onClick={() => setFechados((s) => { const n = new Set(s); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })}>
                  {closed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  <span className="h-3 w-3 rounded-full border border-border" style={{ background: g.cor || "transparent" }} />
                  <span className="font-semibold text-foreground">{g.nome}</span>
                  <Badge variant="secondary">{g.itens.length}</Badge>
                </button>
                {!closed && (
                  <div className="border-t border-border">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Tarefa</TableHead><TableHead>Responsáveis</TableHead><TableHead>Prazo</TableHead><TableHead>Prioridade</TableHead><TableHead className="w-28 text-right">Ações</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {g.itens.map((t) => {
                          const id = String(rowId(t));
                          const filhas = ativsDe(id);
                          const fechada = !expandidas.has(id);
                          const pct = tarefaPct(t, tc.done);
                          return (
                            <Fragment key={id}>
                              <TableRow className={`cursor-pointer ${arrastando === id ? "opacity-50" : ""}`} onClick={() => setAberta(id)}
                                draggable={perms.canUpdate}
                                onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setArrastando(id); }}
                                onDragEnd={() => setArrastando(null)}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-1">
                                    <button type="button" className="rounded p-0.5 hover:bg-muted" aria-label={fechada ? "Expandir" : "Recolher"}
                                      onClick={(e) => { e.stopPropagation(); setExpandidas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }}>
                                      {fechada ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                    </button>
                                    <span>{String(t[tc.nome] ?? "")}</span>
                                    <Badge variant="secondary" className="ml-1 text-[10px]">{filhas.length} ativ.</Badge>
                                    {origem(t) && <span className="ml-1 text-xs text-muted-foreground">· {origem(t)}</span>}
                                  </div>
                                  <div className="mt-1 flex items-center gap-2 pl-6"><Progress value={pct} indicatorColor={progressoCor(pct)} className="h-1 w-24 bg-muted" /><span className="text-xs text-muted-foreground">{pct}%</span></div>
                                </TableCell>
                                <TableCell><IniciaisResponsaveis ids={responsaveisDe(t, tc.resp)} usuarios={usuarios} /></TableCell>
                                <TableCell>{fmtDate(t[tc.fim])}</TableCell>
                                <TableCell><Badge className={prioridadeClass(t[tc.prio])}>{String(t[tc.prio] ?? "Normal")}</Badge></TableCell>
                                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                  {perms.canCreate && <Button size="icon" variant="ghost" title="Nova atividade" aria-label="Nova atividade" onClick={() => { setExpandidas((s) => new Set(s).add(id)); setAtivAberta({ id: null, tarefa: id }); }}><Plus className="h-4 w-4" /></Button>}
                                  <Button size="icon" variant="ghost" aria-label="Abrir" onClick={() => setAberta(id)}><Pencil className="h-4 w-4" /></Button>
                                  {perms.canDelete && <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => excluir(t)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                                </TableCell>
                              </TableRow>
                              {!fechada && filhas.map((a) => {
                                const ap = atividadePct(a);
                                return (
                                  <TableRow key={String(rowId(a))} className="cursor-pointer bg-muted/20" onClick={() => setAtivAberta({ id: String(rowId(a)), tarefa: id })}>
                                    <TableCell>
                                      <div className="flex items-center gap-2 pl-7 text-sm">
                                        <span onClick={(e) => e.stopPropagation()}><Checkbox disabled={!perms.canUpdate} checked={ap >= 100} onCheckedChange={(v) => concluirAtividade(a, v === true)} aria-label="Atividade concluída" /></span>
                                        {String(a["nome"] ?? "")}<span className="text-xs text-muted-foreground">{ap}%</span>
                                      </div>
                                    </TableCell>
                                    <TableCell><IniciaisResponsaveis ids={Array.isArray(a["responsaveis"]) ? (a["responsaveis"] as unknown[]).map(String) : []} usuarios={usuarios} /></TableCell>
                                    <TableCell className="text-sm">{fmtDate(a["dt_fim"])}</TableCell>
                                    <TableCell><Badge className={prioridadeClass(a["prioridade"])}>{String(a["prioridade"] ?? "Normal")}</Badge></TableCell>
                                    <TableCell />
                                  </TableRow>
                                );
                              })}
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                    <div className="p-2">{addRapido(g.id)}</div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <TarefaSheet tarefa={tarefaAberta} isNew={nova !== null} tarefasDoProjeto={tarefas} projetoId={tarefaAberta ? String(tarefaAberta[tc.projeto] ?? "") : ""}
        espacoId={espacoId} statusId={nova ?? undefined} statusOpcoes={ordenados} statusNomeCol={statusNome} perms={perms}
        onClose={() => { setAberta(null); setNova(null); }} />
      <AtividadeSheet atividade={ativAberta?.id ? atividades.find((a) => String(rowId(a)) === ativAberta.id) ?? null : null}
        isNew={Boolean(ativAberta && !ativAberta.id)} tarefaId={ativAberta?.tarefa ?? ""}
        projetoId={String(tarefas.find((t) => String(rowId(t)) === ativAberta?.tarefa)?.[tc.projeto] ?? "")}
        atividadesDoProjeto={atividades} tCols={tCols} perms={perms} onClose={() => setAtivAberta(null)} />
    </div>
  );
}
