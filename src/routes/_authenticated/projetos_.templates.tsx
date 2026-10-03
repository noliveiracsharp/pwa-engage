import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TemplateTarefas, TAREFAS_PADRAO } from "@/components/projetos/TarefasPadraoDialog";
import { useTableRows, rowId, idColumn, matches } from "@/lib/crud";
import { useAudit } from "@/lib/audit";
import { filterPayload, useCols } from "@/lib/projetos";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/projetos_/templates")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Templates de Tarefas — Atende.ai" },
      { name: "description", content: "Monte templates com tarefas padrão para aplicar em novos projetos." },
      { property: "og:title", content: "Templates de Tarefas — Atende.ai" },
      { property: "og:description", content: "Monte templates com tarefas padrão para aplicar em novos projetos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TemplatesPage,
});

const T = "projetos_templates";

function TemplatesPage() {
  const perms = usePagePermissions("/projetos");
  const qc = useQueryClient();
  const { stamp } = useAudit();
  const { data: cols } = useCols(T);
  const { data: rows = [], isLoading } = useTableRows(T);
  const [sel, setSel] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState("");
  const [edit, setEdit] = useState<{ id: string; nome: string; descricao: string } | null>(null);
  const sorted = [...rows].sort((a, b) => String(a["nome"] ?? "").localeCompare(String(b["nome"] ?? ""), "pt-BR"));
  const atual = sorted.find((r) => String(rowId(r)) === sel) ?? null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["table", T] });

  async function criar() {
    if (!novo.trim()) return;
    const { data, error } = await supabase.from(T).insert(filterPayload(stamp({ nome: novo.trim() }, true), cols) as never).select().maybeSingle();
    if (error) { console.error(error); toast.error(error.message); return; }
    setNovo(""); await refresh();
    if (data) setSel(String(rowId(data as never)));
  }
  async function salvar() {
    if (!edit || !edit.nome.trim()) return;
    const r = rows.find((x) => String(rowId(x)) === edit.id)!;
    const { error } = await supabase.from(T).update(filterPayload(stamp({ nome: edit.nome.trim(), descricao: edit.descricao.trim() || null }, false), cols) as never).eq(idColumn(r), edit.id as never);
    if (error) { toast.error(error.message); return; }
    setEdit(null); refresh();
  }
  async function excluir(id: string, nome: string) {
    if (!confirm(`Excluir o template "${nome}" e suas tarefas padrão?`)) return;
    await supabase.from(TAREFAS_PADRAO).delete().eq("template_id", id as never);
    const { error } = await supabase.from(T).delete().eq("id", id as never);
    if (error) { toast.error(error.message); return; }
    if (sel === id) setSel(null);
    refresh(); qc.invalidateQueries({ queryKey: ["table", TAREFAS_PADRAO] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Voltar"><Link to="/projetos"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-bold text-foreground">Templates de Tarefas</h1>
      </div>
      <div className="flex flex-col gap-4 md:flex-row">
        <aside className="w-full shrink-0 space-y-2 rounded-lg border border-border bg-card p-3 md:w-72">
          <Input placeholder="Pesquisar template…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          {perms.canCreate && (
            <div className="flex gap-2">
              <Input placeholder="Novo template" value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && criar()} />
              <Button size="icon" onClick={criar} aria-label="Criar template"><Plus className="h-4 w-4" /></Button>
            </div>
          )}
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && sorted.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nenhum template criado.</p>}
          <ul className="space-y-1">
            {sorted.filter((r) => matches(r["nome"], busca)).map((r) => {
              const id = String(rowId(r));
              return (
                <li key={id}>
                  <button onClick={() => setSel(id)} className={cn("w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent", sel === id && "bg-primary/10 font-semibold text-primary")}>
                    <span className="block truncate">{String(r["nome"] ?? "")}</span>
                    {r["descricao"] ? <span className="block truncate text-xs text-muted-foreground">{String(r["descricao"])}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
        <section className="min-w-0 flex-1 rounded-lg border border-border bg-card p-4">
          {!atual && <p className="py-10 text-center text-sm text-muted-foreground">Escolha ou crie um template para cadastrar as tarefas.</p>}
          {atual && (
            <div className="space-y-4">
              {edit?.id === String(rowId(atual)) ? (
                <div className="space-y-2">
                  <Input value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} aria-label="Nome do template" />
                  <Input value={edit.descricao} placeholder="Descrição" onChange={(e) => setEdit({ ...edit, descricao: e.target.value })} aria-label="Descrição do template" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={salvar}><Check className="mr-1 h-4 w-4" />Salvar</Button>
                    <Button size="sm" variant="outline" onClick={() => setEdit(null)}><X className="mr-1 h-4 w-4" />Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-semibold text-foreground">{String(atual["nome"] ?? "")}</h2>
                    {atual["descricao"] ? <p className="text-sm text-muted-foreground">{String(atual["descricao"])}</p> : null}
                  </div>
                  {perms.canUpdate && <Button size="icon" variant="ghost" aria-label="Editar template" onClick={() => setEdit({ id: String(rowId(atual)), nome: String(atual["nome"] ?? ""), descricao: String(atual["descricao"] ?? "") })}><Pencil className="h-4 w-4" /></Button>}
                  {perms.canDelete && <Button size="icon" variant="ghost" aria-label="Excluir template" onClick={() => excluir(String(rowId(atual)), String(atual["nome"] ?? ""))}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                </div>
              )}
              <TemplateTarefas key={String(rowId(atual))} templateId={String(rowId(atual))} perms={perms} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
