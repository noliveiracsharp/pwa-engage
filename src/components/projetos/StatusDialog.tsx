import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTableRows, rowId, idColumn } from "@/lib/crud";
import { useAudit } from "@/lib/audit";
import { C, filterPayload, resolveCol, useCols } from "@/lib/projetos";
import type { Row } from "@/lib/row";
import type { Perms } from "@/hooks/usePagePermissions";
import { confirmar } from "@/components/layout/DialogoGlobal";

const T = "projetos_status";
export const TIPOS_STATUS = [
  { value: "a_fazer", label: "A fazer" },
  { value: "progresso", label: "Em progresso" },
  { value: "concluido", label: "Concluído" },
  { value: "erro", label: "Erro" },
] as const;
export const tipoLabel = (v: unknown) => TIPOS_STATUS.find((t) => t.value === v)?.label ?? "A fazer";

export function StatusDialog({ open, onOpenChange, perms, projetos, espacoId, espacoNome }: {
  open: boolean; onOpenChange: (v: boolean) => void; perms: Perms; projetos: Row[]; statusCol: string;
  espacoId: string | null; espacoNome?: string;
}) {
  const qc = useQueryClient();
  const { data: all = [] } = useTableRows(T);
  const { data: cols } = useCols(T);
  const { stamp } = useAudit();
  const rows = all.filter((r) => String(r["espaco_id"] ?? "") === (espacoId ?? ""));
  const nomeC = resolveCol(cols, all, C.status.nome);
  const ordemC = resolveCol(cols, all, C.status.ordem);
  const corC = resolveCol(cols, all, C.status.cor);
  const projStatusC = resolveCol(undefined, projetos, C.projeto.status);
  const sorted = [...rows].sort((a, b) => Number(a[ordemC] ?? 0) - Number(b[ordemC] ?? 0));
  const [novo, setNovo] = useState("");
  const [novaCor, setNovaCor] = useState("#3b82f6");
  const [novoTipo, setNovoTipo] = useState("a_fazer");
  const [edit, setEdit] = useState<{ id: string; nome: string; cor: string; tipo: string } | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["table", T] });
  const fail = (e: { message: string } | null) => { if (e) { console.error(e); toast.error(e.message); return true; } return false; };

  async function add() {
    if (!novo.trim()) return;
    const payload = filterPayload(stamp({ [nomeC]: novo.trim(), [ordemC]: sorted.length + 1, [corC]: novaCor, tipo: novoTipo, espaco_id: espacoId }, true), cols);
    if (fail((await supabase.from(T).insert(payload as never)).error)) return;
    setNovo(""); refresh();
  }
  async function save() {
    if (!edit) return;
    const r = rows.find((x) => String(rowId(x)) === edit.id)!;
    const payload = filterPayload(stamp({ [nomeC]: edit.nome, [corC]: edit.cor, tipo: edit.tipo }, false), cols);
    if (fail((await supabase.from(T).update(payload as never).eq(idColumn(r), rowId(r) as never)).error)) return;
    setEdit(null); refresh();
  }
  async function remove(r: Row) {
    const id = String(rowId(r));
    if (projetos.some((p) => String(p[projStatusC] ?? "") === id)) {
      toast.error("Há projetos neste status. Mova-os antes de excluir."); return;
    }
    if (!await confirmar(`Excluir o status "${r[nomeC]}"?`)) return;
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
      await supabase.from(T).update({ [ordemC]: k + 1 } as never).eq(idColumn(r), rowId(r) as never);
    }
    refresh();
  }

  const TipoSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
      <SelectContent>{TIPOS_STATUS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Gerenciar status{espacoNome ? ` — ${espacoNome}` : ""}</DialogTitle>
          <DialogDescription>
            {espacoId ? "Status próprios deste espaço. Sem status próprios, ele usa os do espaço acima ou os gerais." : "Status gerais, usados por espaços sem status próprios."}
          </DialogDescription>
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
                    <TipoSelect value={edit.tipo} onChange={(v) => setEdit({ ...edit, tipo: v })} />
                    <Button size="icon" variant="ghost" onClick={save} aria-label="Salvar"><Check className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setEdit(null)} aria-label="Cancelar"><X className="h-4 w-4" /></Button>
                  </>
                ) : (
                  <>
                    <span className="h-3 w-3 shrink-0 rounded-full border border-border" style={{ background: String(r[corC] ?? "transparent") }} />
                    <span className="flex-1 text-sm">{String(r[nomeC] ?? "")}</span>
                    <Badge variant="outline">{tipoLabel(r["tipo"])}</Badge>
                    {perms.canUpdate && (
                      <>
                        <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" disabled={i === sorted.length - 1} onClick={() => move(i, 1)} aria-label="Descer"><ArrowDown className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setEdit({ id, nome: String(r[nomeC] ?? ""), cor: String(r[corC] ?? "#3b82f6"), tipo: String(r["tipo"] ?? "a_fazer") || "a_fazer" })} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
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
          {sorted.length === 0 && <p className="text-sm text-muted-foreground">Nenhum status cadastrado aqui.</p>}
        </div>
        {perms.canCreate && (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <input type="color" value={novaCor} onChange={(e) => setNovaCor(e.target.value)} className="h-9 w-9 rounded" aria-label="Cor" />
            <Input className="min-w-40 flex-1" placeholder="Novo status (ex.: Em produção)" value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            <TipoSelect value={novoTipo} onChange={setNovoTipo} />
            <Button onClick={add}><Plus className="mr-1 h-4 w-4" />Adicionar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
