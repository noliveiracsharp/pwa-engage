import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useTableRows, rowId, idColumn } from "@/lib/crud";
import { useAudit } from "@/lib/audit";
import { C, filterPayload, resolveCol, useCols } from "@/lib/projetos";
import type { Row } from "@/lib/row";
import type { Perms } from "@/hooks/usePagePermissions";

const T = "projetos_status";

export function StatusDialog({ open, onOpenChange, perms, projetos }: {
  open: boolean; onOpenChange: (v: boolean) => void; perms: Perms; projetos: Row[]; statusCol: string;
}) {
  const qc = useQueryClient();
  const { data: rows = [] } = useTableRows(T);
  const { data: cols } = useCols(T);
  const { stamp } = useAudit();
  const nomeC = resolveCol(cols, rows, C.status.nome);
  const ordemC = resolveCol(cols, rows, C.status.ordem);
  const corC = resolveCol(cols, rows, C.status.cor);
  const projStatusC = resolveCol(undefined, projetos, C.projeto.status);
  const sorted = [...rows].sort((a, b) => Number(a[ordemC] ?? 0) - Number(b[ordemC] ?? 0));
  const [novo, setNovo] = useState("");
  const [novaCor, setNovaCor] = useState("#3b82f6");
  const [edit, setEdit] = useState<{ id: string; nome: string; cor: string } | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["table", T] });
  const fail = (e: { message: string } | null) => { if (e) { toast.error(e.message); return true; } return false; };

  async function add() {
    if (!novo.trim()) return;
    const payload = filterPayload(stamp({ [nomeC]: novo.trim(), [ordemC]: sorted.length + 1, [corC]: novaCor }, true), cols);
    if (fail((await supabase.from(T).insert(payload)).error)) return;
    setNovo(""); refresh();
  }
  async function save() {
    if (!edit) return;
    const r = rows.find((x) => String(rowId(x)) === edit.id)!;
    const payload = filterPayload(stamp({ [nomeC]: edit.nome, [corC]: edit.cor }, false), cols);
    if (fail((await supabase.from(T).update(payload).eq(idColumn(r), rowId(r) as never)).error)) return;
    setEdit(null); refresh();
  }
  async function remove(r: Row) {
    const id = String(rowId(r));
    if (projetos.some((p) => String(p[projStatusC] ?? "") === id)) {
      toast.error("Há projetos neste status. Mova-os antes de excluir."); return;
    }
    if (!confirm(`Excluir o status "${r[nomeC]}"?`)) return;
    if (fail((await supabase.from(T).delete().eq(idColumn(r), rowId(r) as never)).error)) return;
    refresh();
  }
  async function move(i: number, dir: -1 | 1) {
    const list = [...sorted];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    for (let k = 0; k < list.length; k++) {
      const r = list[k]!;
      await supabase.from(T).update({ [ordemC]: k + 1 }).eq(idColumn(r), rowId(r) as never);
    }
    refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerenciar status</DialogTitle>
          <DialogDescription>Os grupos do painel de projetos aparecem nesta ordem.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {sorted.map((r, i) => {
            const id = String(rowId(r));
            const editing = edit?.id === id;
            return (
              <div key={id} className="flex items-center gap-2 rounded-md border border-border p-2">
                {editing ? (
                  <>
                    <input type="color" value={edit.cor} onChange={(e) => setEdit({ ...edit, cor: e.target.value })} className="h-8 w-8 rounded" />
                    <Input value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} className="h-8" />
                    <Button size="icon" variant="ghost" onClick={save} aria-label="Salvar"><Check className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setEdit(null)} aria-label="Cancelar"><X className="h-4 w-4" /></Button>
                  </>
                ) : (
                  <>
                    <span className="h-3 w-3 shrink-0 rounded-full border border-border" style={{ background: String(r[corC] ?? "transparent") }} />
                    <span className="flex-1 text-sm">{String(r[nomeC] ?? "")}</span>
                    {perms.canUpdate && (
                      <>
                        <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" disabled={i === sorted.length - 1} onClick={() => move(i, 1)} aria-label="Descer"><ArrowDown className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setEdit({ id, nome: String(r[nomeC] ?? ""), cor: String(r[corC] ?? "#3b82f6") })} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                      </>
                    )}
                    {perms.canDelete && (
                      <Button size="icon" variant="ghost" onClick={() => remove(r)} aria-label="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    )}
                  </>
                )}
              </div>
            );
          })}
          {sorted.length === 0 && <p className="text-sm text-muted-foreground">Nenhum status cadastrado.</p>}
        </div>
        {perms.canCreate && (
          <div className="flex items-center gap-2 pt-2">
            <input type="color" value={novaCor} onChange={(e) => setNovaCor(e.target.value)} className="h-9 w-9 rounded" />
            <Input placeholder="Novo status (ex.: Em produção)" value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            <Button onClick={add}><Plus className="mr-1 h-4 w-4" />Adicionar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
