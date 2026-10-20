import { useMemo, useState } from "react";
import { Pencil, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAudit } from "@/lib/audit";
import { rowId, useSaveRecord, useTableRows } from "@/lib/crud";
import { descendantIds } from "@/lib/hierarchy";
import type { Row } from "@/lib/row";

export const CLASSIFICA_TABLE = "parceiros_classifica";
const PAI = "classifica_pai_id";
const NENHUM = "__nenhum__";

/** Caminho completo: "Pai > Filho". */
export function caminhoClassificacao(rows: Row[], id: unknown): string {
  const porId = new Map(rows.map((r) => [String(rowId(r)), r]));
  const partes: string[] = [];
  let atual = id == null || id === "" ? undefined : porId.get(String(id));
  let guard = 0;
  while (atual && guard++ < 20) {
    partes.unshift(String(atual["descricao"] ?? ""));
    atual = atual[PAI] ? porId.get(String(atual[PAI])) : undefined;
  }
  return partes.join(" > ");
}

export function useClassificacoes() {
  return useTableRows(CLASSIFICA_TABLE);
}

function opcoes(rows: Row[], soAtivas: boolean) {
  return rows
    .filter((r) => !soAtivas || r["status"] !== false)
    .map((r) => ({ id: String(rowId(r)), label: caminhoClassificacao(rows, rowId(r)) }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export function ClassificacaoField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const { data: rows = [] } = useClassificacoes();
  const [gerir, setGerir] = useState(false);
  const lista = useMemo(() => opcoes(rows, true), [rows]);
  return (
    <div>
      <Label className="mb-1.5 block text-sm font-medium">Classificação</Label>
      <div className="flex gap-2">
        <Select value={value || NENHUM} disabled={disabled} onValueChange={(v) => onChange(v === NENHUM ? "" : v)}>
          <SelectTrigger><SelectValue placeholder="Sem classificação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NENHUM}>Sem classificação</SelectItem>
            {lista.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="icon" title="Gerenciar classificações" disabled={disabled} onClick={() => setGerir(true)}>
          <Settings2 className="h-4 w-4" />
        </Button>
      </div>
      <GerenciarClassificacoes open={gerir} onOpenChange={setGerir} rows={rows} onEscolher={(id) => { onChange(id); setGerir(false); }} />
    </div>
  );
}

function GerenciarClassificacoes({ open, onOpenChange, rows, onEscolher }: {
  open: boolean; onOpenChange: (o: boolean) => void; rows: Row[]; onEscolher: (id: string) => void;
}) {
  const save = useSaveRecord(CLASSIFICA_TABLE);
  const { stamp, usuarioId } = useAudit();
  const [edit, setEdit] = useState<Row | null>(null);
  const [form, setForm] = useState({ descricao: "", pai: "", status: true });
  const [busca, setBusca] = useState("");
  const todas = useMemo(() => opcoes(rows, false), [rows]);
  const porId = useMemo(() => new Map(rows.map((r) => [String(rowId(r)), r])), [rows]);
  const bloqueados = useMemo(() => (edit ? descendantIds(rows, PAI, String(rowId(edit))) : new Set<string>()), [rows, edit]);

  const novo = () => { setEdit(null); setForm({ descricao: "", pai: "", status: true }); };
  const editar = (r: Row) => { setEdit(r); setForm({ descricao: String(r["descricao"] ?? ""), pai: r[PAI] ? String(r[PAI]) : "", status: r["status"] !== false }); };

  const salvar = async () => {
    const descricao = form.descricao.trim();
    if (!descricao) return;
    const values: Row = { descricao, [PAI]: form.pai || null, status: form.status };
    if (!edit && usuarioId !== undefined) values["criado_por"] = usuarioId;
    await save.mutateAsync({ values: stamp(values, !edit), original: edit });
    novo();
  };

  const filtradas = todas.filter((o) => o.label.toLowerCase().includes(busca.trim().toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Classificações de parceiros</DialogTitle></DialogHeader>
        <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-6">
          <div className="sm:col-span-3">
            <Label className="mb-1.5 block text-sm">{edit ? "Editar descrição" : "Nova classificação"}</Label>
            <Input value={form.descricao} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} placeholder="Ex.: Condomínios" />
          </div>
          <div className="sm:col-span-3">
            <Label className="mb-1.5 block text-sm">Classificação pai</Label>
            <Select value={form.pai || NENHUM} onValueChange={(v) => setForm((p) => ({ ...p, pai: v === NENHUM ? "" : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUM}>Nenhuma (nível principal)</SelectItem>
                {todas.filter((o) => !bloqueados.has(o.id)).map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3 sm:col-span-3">
            <Switch checked={form.status} onCheckedChange={(v) => setForm((p) => ({ ...p, status: v }))} />
            <span className="text-sm">{form.status ? "Ativa" : "Inativa"}</span>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-3">
            {edit && <Button variant="outline" onClick={novo}>Cancelar</Button>}
            <Button onClick={() => void salvar()} disabled={save.isPending || !form.descricao.trim()}>
              {edit ? "Salvar" : <><Plus className="mr-1 h-4 w-4" />Adicionar</>}
            </Button>
          </div>
        </div>
        <Input placeholder="Pesquisar..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="max-h-72 divide-y overflow-y-auto rounded-lg border">
          {filtradas.length === 0 && <p className="text-muted-foreground p-4 text-sm">Nenhuma classificação cadastrada.</p>}
          {filtradas.map((o) => {
            const r = porId.get(o.id)!;
            const ativa = r["status"] !== false;
            return (
              <div key={o.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className={`flex-1 ${ativa ? "" : "text-muted-foreground line-through"}`}>{o.label}</span>
                {ativa && <Button size="sm" variant="ghost" onClick={() => onEscolher(o.id)}>Usar</Button>}
                <Button size="icon" variant="ghost" title="Editar" onClick={() => editar(r)}><Pencil className="h-4 w-4" /></Button>
              </div>
            );
          })}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
