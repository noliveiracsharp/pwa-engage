import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { rowId, idColumn } from "@/lib/crud";
import { useAudit } from "@/lib/audit";
import { filterPayload, PRIORIDADES, prioridadeClass, useCols } from "@/lib/projetos";
import type { Row } from "@/lib/row";
import type { Perms } from "@/hooks/usePagePermissions";
import { SortableList, proximaOrdem, salvarOrdem, useSortableRow } from "@/lib/reorder";

export const TAREFAS_PADRAO = "projetos_tarefas_default";
const VAZIO = { nome: "", descricao: "", prioridade: "Normal", dias: "1" };

export function TarefasPadraoDialog({ open, onOpenChange, perms }: { open: boolean; onOpenChange: (v: boolean) => void; perms: Perms }) {
  const qc = useQueryClient();
  const { data: cols } = useCols(TAREFAS_PADRAO);
  // Master usa a empresa do "Contexto da Empresa"; usuário comum, a própria empresa.
  const { stamp, empresaId } = useAudit();
  const empId = empresaId !== undefined && empresaId !== null && String(empresaId) !== "" ? String(empresaId) : "";
  const qKey = ["table", TAREFAS_PADRAO, "emp", empId];
  const { data: rows = [] } = useQuery({
    queryKey: qKey,
    enabled: open,
    queryFn: async (): Promise<Row[]> => {
      let q = supabase.from(TAREFAS_PADRAO).select("*");
      if (empId) q = q.eq("empresa_id", empId as never) as typeof q;
      const { data, error } = await q.order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const [edit, setEdit] = useState<Row | "new" | null>(null);
  const [f, setF] = useState(VAZIO);
  const [saving, setSaving] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["table", TAREFAS_PADRAO] });
  const sorted = [...rows].sort((a, b) => (Number(a["ordem"]) || 0) - (Number(b["ordem"]) || 0));

  async function reordenar(novo: Row[]) {
    qc.setQueryData(qKey, novo.map((r, i) => ({ ...r, ordem: i })));
    try { await salvarOrdem(TAREFAS_PADRAO, novo); }
    catch (e) { toast.error((e as Error).message); refresh(); }
  }

  function abrir(r: Row | "new") {
    setEdit(r);
    setF(r === "new" ? VAZIO : {
      nome: String(r["nome"] ?? ""), descricao: String(r["descricao"] ?? ""),
      prioridade: String(r["prioridade"] ?? "Normal") || "Normal", dias: String(r["dias_estimados"] ?? "0"),
    });
  }

  async function salvar() {
    if (!f.nome.trim()) { toast.error("Informe o nome."); return; }
    const dias = Math.max(0, Math.round(Number(f.dias) || 0));
    const isNew = edit === "new";
    const payload = filterPayload(stamp({ nome: f.nome.trim(), descricao: f.descricao.trim() || null, prioridade: f.prioridade, dias_estimados: dias, ...(isNew ? { ordem: proximaOrdem(rows) } : {}) }, isNew), cols);
    setSaving(true);
    const { error } = isNew
      ? await supabase.from(TAREFAS_PADRAO).insert(payload)
      : await supabase.from(TAREFAS_PADRAO).update(payload).eq(idColumn(edit as Row), rowId(edit as Row) as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Tarefa padrão salva.");
    setEdit(null); refresh();
  }

  async function excluir(r: Row) {
    if (!confirm(`Excluir a tarefa padrão "${r["nome"]}"?`)) return;
    const { error } = await supabase.from(TAREFAS_PADRAO).delete().eq(idColumn(r), rowId(r) as never);
    if (error) { toast.error(error.message); return; }
    refresh();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setEdit(null); onOpenChange(v); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tarefas Padrão</DialogTitle>
          <DialogDescription>Modelos que podem ser importados de uma vez para qualquer projeto.</DialogDescription>
        </DialogHeader>

        {edit ? (
          <div className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="tp-nome">Nome</Label>
              <Input id="tp-nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="tp-desc">Descrição</Label>
              <Textarea id="tp-desc" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Prioridade</Label>
                <Select value={f.prioridade} onValueChange={(v) => setF({ ...f, prioridade: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORIDADES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1.5"><Label htmlFor="tp-dias">Dias Estimados</Label>
                <Input id="tp-dias" type="number" min={0} value={f.dias} onChange={(e) => setF({ ...f, dias: e.target.value })} /></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
              <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {perms.canCreate && <Button onClick={() => abrir("new")}><Plus className="mr-1 h-4 w-4" />Nova tarefa padrão</Button>}
            {sorted.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma tarefa padrão cadastrada.</p>}
            <SortableList rows={sorted} onReorder={reordenar}>
              <ul className="divide-y rounded-md border">
                {sorted.map((r) => (
                  <PadraoItem key={String(rowId(r))} r={r} perms={perms} onEdit={() => abrir(r)} onDelete={() => excluir(r)} />
                ))}
              </ul>
            </SortableList>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PadraoItem({ r, perms, onEdit, onDelete }: { r: Row; perms: Perms; onEdit: () => void; onDelete: () => void }) {
  const { setNodeRef, style, handle } = useSortableRow(String(rowId(r)), !perms.canUpdate);
  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-3 bg-background p-3">
      {handle}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{String(r["nome"] ?? "")}</p>
        {r["descricao"] ? <p className="truncate text-xs text-muted-foreground">{String(r["descricao"])}</p> : null}
      </div>
      <Badge className={prioridadeClass(r["prioridade"])}>{String(r["prioridade"] ?? "Normal")}</Badge>
      <span className="w-16 text-right text-sm text-muted-foreground">{Number(r["dias_estimados"] ?? 0)} dia(s)</span>
      {perms.canUpdate && <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>}
      {perms.canDelete && <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>}
    </li>
  );
}
