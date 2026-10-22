import { useAuth } from "@/hooks/useAuth";
import { registrarEventoProjeto } from "@/lib/projetos-eventos";
import { ResponsaveisPicker, responsaveisDe } from "@/components/projetos/ResponsaveisPicker";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { duplicarTarefa } from "@/lib/projetos";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useTableRows, rowId, idColumn } from "@/lib/crud";
import { useAudit } from "@/lib/audit";
import { C, PRIORIDADES, filterPayload, isDone, prioridadeClass, progressoCor, resolveCol, tarefaPct, useCols } from "@/lib/projetos";
import type { Row } from "@/lib/row";
import type { Perms } from "@/hooks/usePagePermissions";
import { Switch } from "@/components/ui/switch";
import { ComentariosTarefa } from "@/components/projetos/ComentariosTarefa";

export function TarefaSheet({ tarefa, tarefasDoProjeto, projetoId, perms, onClose, isNew, espacoId, statusId, statusOpcoes, statusNomeCol }: {
  tarefa: Row | null; tarefasDoProjeto: Row[]; projetoId: string; perms: Perms; onClose: () => void; isNew: boolean;
  /** Tarefa direto no espaço (sem projeto), estilo ClickUp. */
  espacoId?: string | null; statusId?: string | undefined; statusOpcoes?: Row[]; statusNomeCol?: string;
}) {
  const qc = useQueryClient();
  const { stamp, empresaId, usuarioId } = useAudit();
  const { usuario } = useAuth();
  const { data: usuarios = [] } = useTableRows("usuarios");
  const { data: tCols } = useCols("projetos_tarefas");
  const allT = tarefasDoProjeto;
  const tc = {
    projeto: resolveCol(tCols, allT, C.tarefa.projeto),
    nome: resolveCol(tCols, allT, C.tarefa.nome),
    descricao: resolveCol(tCols, allT, C.tarefa.descricao),
    resp: resolveCol(tCols, allT, C.tarefa.responsavel),
    ini: resolveCol(tCols, allT, C.tarefa.dtInicio),
    fim: resolveCol(tCols, allT, C.tarefa.dtFim),
    prio: resolveCol(tCols, allT, C.tarefa.prioridade),
    done: resolveCol(tCols, allT, C.tarefa.concluida),
  };
  const open = Boolean(tarefa) || isNew;
  const readOnly = isNew ? !perms.canCreate : !perms.canUpdate;
  const [form, setForm] = useState<Row>({});
  // Só reinicia o formulário ao abrir outra tarefa (ou nova); recargas em segundo plano
  // (progresso, checklist) não podem apagar o que está sendo digitado.
  const formKey = isNew ? "nova" : tarefa ? String(rowId(tarefa)) : "";
  useEffect(() => {
    setForm(tarefa ? { ...tarefa } : { [tc.prio]: "Normal", status_id: statusId ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formKey]);
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const resps = responsaveisDe(form, tc.resp);
  async function salvar() {
    if (!String(form[tc.nome] ?? "").trim()) { toast.error("Informe o nome da tarefa."); return; }
    const base: Row = {
      [tc.nome]: form[tc.nome], [tc.descricao]: form[tc.descricao] ?? null, [tc.resp]: resps[0] ?? null, responsaveis: resps,
      [tc.ini]: form[tc.ini] || null, [tc.fim]: form[tc.fim] || null, [tc.prio]: form[tc.prio] ?? "Normal",
    };
    if (statusOpcoes) base["status_id"] = form["status_id"] || null;
    if (tCols?.includes("comentarios_publicos")) base["comentarios_publicos"] = form["comentarios_publicos"] === true;
    if (tc.nome === tc.descricao) delete base[tc.descricao];
    let error;
    if (tarefa) {
      ({ error } = await supabase.from("projetos_tarefas").update(filterPayload(stamp(base, false), tCols)).eq(idColumn(tarefa), rowId(tarefa) as never));
    } else {
      base[tc.projeto] = projetoId || null;
      if (!projetoId && espacoId) base["espaco_id"] = espacoId;
      ({ error } = await supabase.from("projetos_tarefas").insert(filterPayload(stamp({ ...base, ordem: tarefasDoProjeto.reduce((mx, t) => Math.max(mx, Number(t["ordem"] ?? -1) || 0), -1) + 1 }, true), tCols)));
    }
    if (error) { toast.error(error.message); return; }
    void registrarEventoProjeto({
      empresaId, autorId: usuarioId, autorNome: String(usuario?.["nome"] ?? ""), projetoId: tarefa ? tarefa[tc.projeto] : projetoId,
      tipo: "tarefa", acao: tarefa ? "alterou" : "criou", titulo: String(form[tc.nome] ?? ""), prazo: form[tc.fim],
      responsaveis: resps, anteriores: tarefa ? responsaveisDe(tarefa, tc.resp) : [],
    });
    toast.success("Tarefa salva.");
    qc.invalidateQueries({ queryKey: ["table", "projetos_tarefas"] });
    onClose();
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle>{isNew ? "Nova tarefa" : String(tarefa?.[tc.nome] ?? "Tarefa")}</SheetTitle>
          <SheetDescription>Dados da tarefa (fase ou entrega do projeto).</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {tarefa && (
            <section className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">Progresso da tarefa</h3>
                <span className="text-sm font-semibold" style={{ color: progressoCor(tarefaPct(tarefa, tc.done)) }}>{tarefaPct(tarefa, tc.done)}%</span>
              </div>
              <Progress value={tarefaPct(tarefa, tc.done)} indicatorColor={progressoCor(tarefaPct(tarefa, tc.done))} className="h-2.5 bg-muted" />
              <p className="text-xs text-muted-foreground">Calculado pela média do progresso das atividades desta tarefa.</p>
            </section>
          )}
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1">
              <Label>Nome da tarefa</Label>
              <Input disabled={readOnly} autoFocus={isNew} value={String(form[tc.nome] ?? "")} onChange={(e) => set(tc.nome, e.target.value)} />
            </div>
            {statusOpcoes && (
              <div className="sm:col-span-2 space-y-1">
                <Label>Status</Label>
                <Select disabled={readOnly} value={String(form["status_id"] ?? "") || "none"} onValueChange={(v) => set("status_id", v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Sem status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem status</SelectItem>
                    {statusOpcoes.map((s) => <SelectItem key={String(rowId(s))} value={String(rowId(s))}>{String(s[statusNomeCol ?? "nome"] ?? "")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {tc.descricao !== tc.nome && (
              <div className="sm:col-span-2 space-y-1">
                <Label>Descrição</Label>
                <Textarea disabled={readOnly} rows={3} value={String(form[tc.descricao] ?? "")} onChange={(e) => set(tc.descricao, e.target.value)} />
              </div>
            )}
            <div className="space-y-1">
              <Label>Responsáveis</Label>
              <div><ResponsaveisPicker disabled={readOnly} value={resps} usuarios={usuarios} onChange={(v) => setForm((f) => ({ ...f, responsaveis: v, [tc.resp]: v[0] ?? null }))} /></div>
            </div>
            <div className="space-y-1">
              <Label>Prioridade</Label>
              <Select disabled={readOnly} value={String(form[tc.prio] ?? "Normal")} onValueChange={(v) => set(tc.prio, v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p} value={p}><Badge className={prioridadeClass(p)}>{p}</Badge></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Dt Início</Label>
              <Input type="date" disabled={readOnly} value={String(form[tc.ini] ?? "").slice(0, 10)} onChange={(e) => set(tc.ini, e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Dt Fim</Label>
              <Input type="date" disabled={readOnly} value={String(form[tc.fim] ?? "").slice(0, 10)} onChange={(e) => set(tc.fim, e.target.value)} />
            </div>
          </section>

          {tCols?.includes("comentarios_publicos") && (
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <span>
                <span className="block text-sm font-medium text-foreground">Pública para o cliente</span>
                <span className="block text-xs text-muted-foreground">O cliente pode comentar nesta tarefa pelo link público do projeto.</span>
              </span>
              <Switch disabled={readOnly} checked={form["comentarios_publicos"] === true} onCheckedChange={(v) => set("comentarios_publicos", v)} />
            </label>
          )}
          {tarefa && <ComentariosTarefa tarefaId={String(rowId(tarefa))} autorNome={String(usuario?.["nome"] ?? "")} usuarioId={usuarioId} readOnly={!perms.canUpdate} />}
          <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
            As atividades (com checklist, dependências e anexos) são criadas pelo botão + de cada tarefa na lista.
          </p>
          {tarefa && isDone(tarefa[tc.done]) && <Badge className="bg-success text-success-foreground">Concluída</Badge>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border p-4">
          {tarefa && perms.canCreate && (
            <Button variant="outline" className="mr-auto" onClick={async () => {
              try {
                await duplicarTarefa(tarefa, tc.nome, tarefasDoProjeto.reduce((mx, t) => Math.max(mx, Number(t["ordem"] ?? 0)), -1) + 1);
                toast.success("Tarefa duplicada com as atividades.");
                qc.invalidateQueries();
                onClose();
              } catch (e) { toast.error((e as Error).message); }
            }}><Copy className="mr-1 h-4 w-4" />Duplicar</Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          {!readOnly && <Button onClick={salvar}>Salvar</Button>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
