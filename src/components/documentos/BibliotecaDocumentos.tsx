import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAudit } from "@/lib/audit";
import { abrirArquivo, enviarPrivado } from "@/lib/arquivos-privados";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { UploadInfo } from "@/components/ui/upload-info";

export type DocumentoOficial = { id: string; titulo: string; categoria: string; arquivo_url: string; nome_arquivo: string };

export function BibliotecaDocumentos({ selecionar, canCreate = false, canDelete = false }: {
  selecionar?: (docs: DocumentoOficial[]) => Promise<void>; canCreate?: boolean; canDelete?: boolean;
}) {
  const { empresaId } = useAudit();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [novo, setNovo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [catNova, setCatNova] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: docs = [], isLoading, error } = useQuery({
    queryKey: ["documentos-oficiais", empresaId], enabled: !!empresaId,
    queryFn: async (): Promise<DocumentoOficial[]> => {
      const { data, error } = await supabase.from("documentos_oficiais").select("id,titulo,categoria,arquivo_url,nome_arquivo")
        .eq("empresa_id", empresaId as string).eq("ativo", true).order("titulo").limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as DocumentoOficial[];
    },
  });
  const categorias = [...new Set(docs.map((d) => d.categoria))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const lista = docs.filter((d) => (!categoria || d.categoria === categoria) && `${d.titulo} ${d.categoria} ${d.nome_arquivo}`.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR")));
  async function salvar() {
    if (!file || !titulo.trim() || !catNova.trim() || !empresaId || !canCreate) return;
    setBusy(true);
    try {
      const ref = await enviarPrivado(file, "documentos-oficiais");
      const { error } = await supabase.from("documentos_oficiais").insert({ empresa_id: empresaId, titulo: titulo.trim(), categoria: catNova.trim(), arquivo_url: ref, nome_arquivo: file.name });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["documentos-oficiais"] });
      setNovo(false); setTitulo(""); setCatNova(""); setFile(null);
      toast.success("Documento salvo.");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function enviarSelecionados() {
    if (!selecionar) return;
    setBusy(true);
    try { await selecionar(docs.filter((d) => selecionados.includes(d.id))); setSelecionados([]); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="flex min-h-0 flex-col gap-3">
    <div className="flex flex-wrap gap-2">
      <Input className="min-w-0 flex-1" aria-label="Pesquisar documentos" placeholder="Pesquisar documentos…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <SearchSelect className="w-52" value={categoria} onChange={setCategoria} placeholder="Todas as categorias" options={categorias.map((c) => ({ value: c, label: c }))} />
      {canCreate && <Button onClick={() => setNovo(true)}><Plus className="mr-1 size-4" /> Novo documento</Button>}
    </div>
    <div className="max-h-[50vh] overflow-y-auto divide-y divide-border">
      {isLoading && <p className="py-4 text-muted-foreground">Carregando…</p>}
      {error && <p role="alert" className="py-4 text-destructive">Não foi possível carregar os documentos. Verifique se o script da biblioteca foi aplicado.</p>}
      {!isLoading && !error && !lista.length && <p className="py-4 text-muted-foreground">Nenhum documento encontrado.</p>}
      {lista.map((d) => <div key={d.id} className="flex items-center gap-3 py-3">
        {selecionar && <Checkbox aria-label={`Selecionar ${d.titulo}`} checked={selecionados.includes(d.id)} disabled={busy} onCheckedChange={(v) => setSelecionados((ids) => v ? [...ids, d.id] : ids.filter((id) => id !== d.id))} />}
        <FileText className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1"><p className="break-words font-medium">{d.titulo}</p><p className="break-words text-xs text-muted-foreground">{d.categoria} · {d.nome_arquivo}</p></div>
        <Button variant="ghost" size="icon" aria-label={`Abrir ${d.titulo}`} tooltip="Abrir documento" onClick={() => void abrirArquivo(d.arquivo_url).catch((e) => toast.error(e.message))}><FileText className="size-4" /></Button>
        {canDelete && <Button variant="ghost" size="icon" aria-label={`Excluir ${d.titulo}`} tooltip="Excluir documento" onClick={async () => {
          if (!await confirmar(`Excluir o documento "${d.titulo}" da biblioteca?`)) return;
          const { error } = await supabase.from("documentos_oficiais").delete().eq("id", d.id).eq("empresa_id", empresaId as string);
          if (error) toast.error(error.message); else void qc.invalidateQueries({ queryKey: ["documentos-oficiais"] });
        }}><Trash2 className="size-4" /></Button>}
      </div>)}
    </div>
    {selecionar && <div className="flex shrink-0 justify-end border-t border-border pt-3"><Button disabled={busy || !selecionados.length} onClick={() => void enviarSelecionados()}>Anexar selecionados ({selecionados.length})</Button></div>}
    <Dialog open={novo} onOpenChange={(v) => !busy && setNovo(v)}><DialogContent><DialogHeader><DialogTitle>Novo documento oficial</DialogTitle></DialogHeader>
      <Label htmlFor="doc-titulo">Título</Label><Input id="doc-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      <Label htmlFor="doc-categoria">Categoria</Label><Input id="doc-categoria" list="doc-categorias" value={catNova} onChange={(e) => setCatNova(e.target.value)} /><datalist id="doc-categorias">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="flex items-center gap-2"><Label htmlFor="doc-arquivo">Arquivo</Label><UploadInfo perfil="chat" arquivos /></div><Input id="doc-arquivo" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,image/*" onChange={(e) => { const f = e.target.files?.[0]; setFile(f ?? null); if (f && !titulo) setTitulo(f.name); }} />
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setNovo(false)}>Cancelar</Button><Button disabled={busy || !file || !titulo.trim() || !catNova.trim()} onClick={() => void salvar()}>Salvar</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}