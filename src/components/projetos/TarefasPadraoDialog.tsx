import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { useTableRows, rowId, idColumn } from "@/lib/crud";
import { useAudit } from "@/lib/audit";
import { filterPayload, PRIORIDADES, prioridadeClass, useCols } from "@/lib/projetos";
import type { Row } from "@/lib/row";
import type { Perms } from "@/hooks/usePagePermissions";

export const TAREFAS_PADRAO = "projetos_tarefas_default";
const VAZIO = { nome: "", descricao: "", prioridade: "Normal", dias: "1" };

export function TarefasPadraoDialog({ open, onOpenChange, perms }: { open: boolean; onOpenChange: (v: boolean) => void; perms: Perms }) {
  const qc = useQueryClient();
  const { data: rows = [] } = useTableRows(TAREFAS_PADRAO, open);
  const { data: cols } = useCols(TAREFAS_PADRAO);
  const { stamp } = useAudit();
  const [edit, setEdit] = useState<Row | "new" | null>(null);
  const [f, setF] = useState(VAZIO);
  const [saving, setSaving] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["table", TAREFAS_PADRAO] });
  const sorted = [...rows].sort((a, b) => String(a["nome"] ?? "").localeCompare(String(b["nome"] ?? ""), "pt-BR"));

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
    const payload = filterPayload(stamp({ nome: f.nome.trim(), descricao: f.descricao.trim() || null, prioridade: f.prioridade, dias_estimados: dias }, isNew), cols);
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
            <ul className="divide-y rounded-md border">
              {sorted.map((r) => (
                <li key={String(rowId(r))} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{String(r["nome"] ?? "")}</p>
                    {r["descricao"] ? <p className="truncate text-xs text-muted-foreground">{String(r["descricao"])}</p> : null}
                  </div>
                  <Badge className={prioridadeClass(r["prioridade"])}>{String(r["prioridade"] ?? "Normal")}</Badge>
                  <span className="w-16 text-right text-sm text-muted-foreground">{Number(r["dias_estimados"] ?? 0)} dia(s)</span>
                  {perms.canUpdate && <Button variant="ghost" size="icon" onClick={() => abrir(r)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>}
                  {perms.canDelete && <Button variant="ghost" size="icon" onClick={() => excluir(r)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
