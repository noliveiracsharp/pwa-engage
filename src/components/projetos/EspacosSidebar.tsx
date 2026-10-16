import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IconPicker } from "@/components/data-table/IconPicker";
import { getIcon } from "@/components/layout/icon-map";
import { rowId, idColumn } from "@/lib/crud";
import { useAudit } from "@/lib/audit";
import { filterPayload, useCols } from "@/lib/projetos";
import { cn } from "@/lib/utils";
import type { Row } from "@/lib/row";
import type { Perms } from "@/hooks/usePagePermissions";

export const ESPACOS = "projetos_espacos";
const PAI = "espaco_pai_id";

/** Natureza do nó da árvore: Espaço/Pasta/Projeto abrem a visão geral; Lista abre as tarefas por status. */
export const TIPOS_ESPACO = [
  { v: "espaco", label: "Espaço", icone: "Folder", desc: "Agrupador macro (ex.: Testes de Usabilidade)." },
  { v: "projeto", label: "Projeto", icone: "Rocket", desc: "Projeto ou versão, com visão geral própria (ex.: 6.0.11 App Novo)." },
  { v: "pasta", label: "Pasta", icone: "FolderOpen", desc: "Só organiza itens, com visão geral." },
  { v: "lista", label: "Lista", icone: "ListChecks", desc: "Onde ficam os status e as tarefas (ex.: Plano de testes)." },
] as const;
export function tipoEspaco(e: Row | undefined): string {
  const t = String(e?.["tipo"] ?? "");
  return TIPOS_ESPACO.some((x) => x.v === t) ? t : "espaco";
}
export const rotuloTipo = (e: Row | undefined) => TIPOS_ESPACO.find((x) => x.v === tipoEspaco(e))!.label;
export function iconeEspaco(e: Row): string {
  const ic = String(e["icone"] ?? "");
  return ic && ic !== "Folder" ? ic : TIPOS_ESPACO.find((x) => x.v === tipoEspaco(e))!.icone;
}

/** Id do espaço e de todos os subespaços abaixo dele. */
export function espacoEDescendentes(espacos: Row[], id: string): Set<string> {
  const out = new Set([id]);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const e of espacos) {
      const eid = String(rowId(e));
      if (!out.has(eid) && out.has(String(e[PAI] ?? ""))) { out.add(eid); mudou = true; }
    }
  }
  return out;
}

/** Caminho do espaço até a raiz (o próprio primeiro). */
export function cadeiaEspaco(espacos: Row[], id: string | null): string[] {
  const out: string[] = [];
  let atual = id;
  while (atual && !out.includes(atual)) {
    out.push(atual);
    const e = espacos.find((x) => String(rowId(x)) === atual);
    atual = e && e[PAI] ? String(e[PAI]) : null;
  }
  return out;
}

type Props = { espacos: Row[]; ativo: string | null; onSelect: (id: string | null) => void; perms: Perms; onMoverProjeto?: (projetoId: string, espacoId: string) => void };

export function EspacosSidebar({ espacos, ativo, onSelect, perms, onMoverProjeto }: Props) {
  const [alvo, setAlvo] = useState<string | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<{ row: Row | null; pai: string | null; paiTipo?: string } | null>(null);
  const qc = useQueryClient();

  const filhos = useMemo(() => {
    const ids = new Set(espacos.map((e) => String(rowId(e))));
    const m = new Map<string, Row[]>();
    for (const e of espacos) {
      const p = e[PAI] && ids.has(String(e[PAI])) ? String(e[PAI]) : "";
      m.set(p, [...(m.get(p) ?? []), e]);
    }
    for (const l of m.values()) l.sort((a, b) => (Number(a["ordem"]) || 0) - (Number(b["ordem"]) || 0) || String(a["nome"] ?? "").localeCompare(String(b["nome"] ?? ""), "pt-BR"));
    return m;
  }, [espacos]);

  async function excluir(e: Row) {
    const id = String(rowId(e));
    if ((filhos.get(id) ?? []).length) { toast.error("Exclua ou mova os subespaços antes."); return; }
    if (!confirm(`Excluir o espaço "${e["nome"]}"? Os projetos dele ficam sem espaço.`)) return;
    await supabase.from("projetos").update({ espaco_id: null } as never).eq("espaco_id", id as never);
    await supabase.from("projetos_status").delete().eq("espaco_id", id as never);
    const { error } = await supabase.from(ESPACOS).delete().eq(idColumn(e), id as never);
    if (error) { console.error(error); toast.error(error.message); return; }
    if (ativo === id) onSelect(null);
    qc.invalidateQueries({ queryKey: ["table", ESPACOS] });
    qc.invalidateQueries({ queryKey: ["table", "projetos"] });
    qc.invalidateQueries({ queryKey: ["table", "projetos_status"] });
  }

  const renderNivel = (pai: string, depth: number): React.ReactNode =>
    (filhos.get(pai) ?? []).map((e) => {
      const id = String(rowId(e));
      const temFilhos = (filhos.get(id) ?? []).length > 0;
      const aberto = abertos.has(id);
      const Icon = getIcon(iconeEspaco(e));
      return (
        <div key={id}>
          <div
            className={cn("group flex items-center gap-1 rounded-md py-1 pr-1 text-sm hover:bg-accent", ativo === id && "bg-primary/10 font-semibold text-primary", alvo === id && "ring-2 ring-primary bg-primary/10")}
            onDragOver={(ev) => { if (onMoverProjeto && ev.dataTransfer.types.includes("text/projeto-id")) { ev.preventDefault(); setAlvo(id); } }}
            onDragLeave={() => setAlvo((a) => (a === id ? null : a))}
            onDrop={(ev) => { const pid = ev.dataTransfer.getData("text/projeto-id"); setAlvo(null); if (pid && onMoverProjeto) { ev.preventDefault(); onMoverProjeto(pid, id); } }}
            style={{ paddingLeft: 4 + depth * 14 }}
          >
            <button className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground" aria-label={aberto ? "Recolher" : "Expandir"}
              onClick={() => setAbertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })}>
              {temFilhos ? (aberto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : null}
            </button>
            <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onSelect(id)}>
              <Icon className="h-4 w-4 shrink-0" style={{ color: String(e["cor"] ?? "") || undefined }} />
              <span className="truncate">{String(e["nome"] ?? "")}</span>
            </button>
            <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
              {perms.canCreate && <Button size="icon" variant="ghost" className="h-6 w-6" title="Novo item dentro (Projeto, Pasta ou Lista)" aria-label="Novo item dentro"
                onClick={() => { setForm({ row: null, pai: id, paiTipo: tipoEspaco(e) }); setAbertos((s) => new Set(s).add(id)); }}><Plus className="h-3.5 w-3.5" /></Button>}
              {perms.canUpdate && <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Editar espaço" onClick={() => setForm({ row: e, pai: e[PAI] ? String(e[PAI]) : null })}><Pencil className="h-3.5 w-3.5" /></Button>}
              {perms.canDelete && <Button size="icon" variant="ghost" className="h-6 w-6" aria-label="Excluir espaço" onClick={() => excluir(e)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
            </div>
          </div>
          {aberto && renderNivel(id, depth + 1)}
        </div>
      );
    });

  return (
    <aside className="w-full shrink-0 rounded-lg border border-border bg-card p-2 md:w-64">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Espaços</span>
        {perms.canCreate && <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setForm({ row: null, pai: null })}><Plus className="mr-1 h-3.5 w-3.5" />Novo Espaço</Button>}
      </div>
      <button className={cn("mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent", ativo === null && "bg-primary/10 font-semibold text-primary")} onClick={() => onSelect(null)}>
        <Layers className="h-4 w-4" />Todos os projetos
      </button>
      {renderNivel("", 0)}
      {espacos.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">Nenhum espaço criado.</p>}
      {form && <EspacoDialog original={form.row} pai={form.pai} total={espacos.length} onClose={() => setForm(null)} />}
    </aside>
  );
}

function EspacoDialog({ original, pai, total, onClose }: { original: Row | null; pai: string | null; total: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { stamp } = useAudit();
  const { data: cols } = useCols(ESPACOS);
  const [nome, setNome] = useState(String(original?.["nome"] ?? ""));
  const [icone, setIcone] = useState(String(original?.["icone"] ?? "Folder"));
  const [cor, setCor] = useState(String(original?.["cor"] ?? "#3b82f6"));
  const [saving, setSaving] = useState(false);

  async function salvar() {
    if (!nome.trim()) { toast.error("Informe o nome."); return; }
    setSaving(true);
    const v: Row = { nome: nome.trim(), icone, cor };
    if (!original) { v[PAI] = pai; v["ordem"] = total; }
    const payload = filterPayload(stamp(v, !original), cols);
    const { error } = original
      ? await supabase.from(ESPACOS).update(payload as never).eq(idColumn(original), rowId(original) as never)
      : await supabase.from(ESPACOS).insert(payload as never);
    setSaving(false);
    if (error) { console.error(error); toast.error(error.message); return; }
    toast.success("Espaço salvo.");
    qc.invalidateQueries({ queryKey: ["table", ESPACOS] });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{original ? "Editar espaço" : pai ? "Novo subespaço" : "Novo espaço"}</DialogTitle>
          <DialogDescription>Nome, ícone e cor do espaço.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="esp-nome">Nome</Label><Input id="esp-nome" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="esp-icone">Ícone</Label><IconPicker id="esp-icone" value={icone} onChange={setIcone} /></div>
          <div className="space-y-1"><Label htmlFor="esp-cor">Cor</Label>
            <div className="flex items-center gap-2"><input id="esp-cor" type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="h-9 w-12 rounded border border-border" /><span className="text-sm text-muted-foreground">{cor}</span></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
