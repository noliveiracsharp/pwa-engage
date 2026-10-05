import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Row } from "@/lib/row";

export const TIPOS_ITEM = [
  { v: "checkbox", l: "Marcar (check)" },
  { v: "texto", l: "Texto" },
  { v: "anexo", l: "Anexo" },
];

/** Templates de checklist da empresa informada. */
export function useChecklistTemplates(empresaId: unknown) {
  return useQuery({
    queryKey: ["table", "checklists_templates", String(empresaId ?? "")],
    enabled: !!empresaId,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.from("checklists_templates").select("*")
        .eq("empresa_id", empresaId as string).order("nome");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
}

type Item = { id?: string; descricao: string; tipo: string; obrigatorio: boolean };

/** Cadastro de templates e seus itens (aba "Checklists" da configuração do quadro). */
export function ChecklistTemplates({ empresaId }: { empresaId: unknown }) {
  const qc = useQueryClient();
  const { data: templates = [] } = useChecklistTemplates(empresaId);
  const [editId, setEditId] = useState<string | "novo" | null>(null);
  const [nome, setNome] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [removidos, setRemovidos] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!editId || editId === "novo") return;
    void supabase.from("checklists_itens").select("*").eq("template_id", editId).order("ordem").then(({ data }) =>
      setItens(((data ?? []) as Row[]).map((r) => ({
        id: String(r["id"]), descricao: String(r["descricao"] ?? ""), tipo: String(r["tipo"] ?? "checkbox"), obrigatorio: r["obrigatorio"] !== false,
      }))));
  }, [editId]);

  function abrir(t?: Row) {
    setRemovidos([]);
    if (t) { setEditId(String(t["id"])); setNome(String(t["nome"] ?? "")); }
    else { setEditId("novo"); setNome(""); setItens([{ descricao: "", tipo: "checkbox", obrigatorio: true }]); }
  }
  const setItem = (i: number, p: Partial<Item>) => setItens((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const mover = (i: number, d: number) => setItens((l) => {
    const n = [...l]; const [m] = n.splice(i, 1); if (m) n.splice(i + d, 0, m); return n;
  });

  async function salvar() {
    setSalvando(true);
    try {
      let tid = editId as string;
      if (editId === "novo") {
        const { data, error } = await supabase.from("checklists_templates").insert({ empresa_id: empresaId, nome: nome.trim() } as never).select("id").single();
        if (error) throw error;
        tid = String((data as Row)["id"]);
      } else {
        const { error } = await supabase.from("checklists_templates").update({ nome: nome.trim() } as never).eq("id", tid);
        if (error) throw error;
      }
      if (removidos.length) {
        const { error } = await supabase.from("checklists_itens").delete().in("id", removidos);
        if (error) throw error;
      }
      const validos = itens.filter((it) => it.descricao.trim());
      for (let i = 0; i < validos.length; i++) {
        const it = validos[i]!;
        const payload = { template_id: tid, descricao: it.descricao.trim(), tipo: it.tipo, obrigatorio: it.obrigatorio, ordem: i + 1 };
        const { error } = it.id
          ? await supabase.from("checklists_itens").update(payload as never).eq("id", it.id)
          : await supabase.from("checklists_itens").insert(payload as never);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["table", "checklists_templates"] });
      toast.success("Checklist salvo.");
      setEditId(null);
    } catch (e) {
      toast.error(`Não foi possível salvar. ${e && typeof e === "object" && "message" in e ? String(e.message) : ""}`);
    } finally { setSalvando(false); }
  }

  async function excluir(t: Row) {
    if (!confirm(`Excluir o checklist "${String(t["nome"])}"?`)) return;
    const { error } = await supabase.from("checklists_templates").delete().eq("id", String(t["id"]));
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["table", "checklists_templates"] });
  }

  if (editId) {
    return (
      <div className="space-y-3">
        <Input placeholder="Nome do checklist (ex.: Passagem para Dev)" value={nome} onChange={(e) => setNome(e.target.value)} />
        <div className="max-h-[40vh] space-y-2 overflow-y-auto">
          {itens.map((it, i) => (
            <div key={it.id ?? `n${i}`} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
              <div className="flex flex-col">
                <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, -1)} className="text-muted-foreground disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label="Descer" disabled={i === itens.length - 1} onClick={() => mover(i, 1)} className="text-muted-foreground disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
              </div>
              <Input className="h-8 min-w-40 flex-1" placeholder="Ex.: Coletou print do erro?" value={it.descricao} onChange={(e) => setItem(i, { descricao: e.target.value })} />
              <Select value={it.tipo} onValueChange={(v) => setItem(i, { tipo: v })}>
                <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS_ITEM.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
              </Select>
              <label className="flex items-center gap-1 text-xs"><Switch checked={it.obrigatorio} onCheckedChange={(v) => setItem(i, { obrigatorio: v })} /> Obrigatório</label>
              <Button size="icon" variant="ghost" aria-label="Remover item" onClick={() => { if (it.id) setRemovidos((r) => [...r, it.id!]); setItens((l) => l.filter((_, j) => j !== i)); }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => setItens((l) => [...l, { descricao: "", tipo: "checkbox", obrigatorio: true }])}><Plus className="mr-1 h-4 w-4" /> Adicionar item</Button>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" onClick={() => setEditId(null)}>Cancelar</Button>
          <Button disabled={!nome.trim() || salvando} onClick={salvar}>Salvar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Crie checklists e vincule-os às etapas (aba Etapas) para exigir preenchimento ao entrar nelas.</p>
      <div className="max-h-[45vh] space-y-2 overflow-y-auto">
        {templates.length === 0 && <p className="text-sm text-muted-foreground">Nenhum checklist cadastrado.</p>}
        {templates.map((t) => (
          <div key={String(t["id"])} className="flex items-center gap-2 rounded-md border border-border p-2">
            <span className="flex-1 truncate text-sm">{String(t["nome"] ?? "")}</span>
            <Button size="icon" variant="ghost" aria-label="Editar checklist" onClick={() => abrir(t)}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" aria-label="Excluir checklist" onClick={() => excluir(t)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
      <Button onClick={() => abrir()}><Plus className="mr-1 h-4 w-4" /> Novo checklist</Button>
    </div>
  );
}
