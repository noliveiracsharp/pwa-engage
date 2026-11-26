import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { SearchSelect } from '@/components/data-table/SearchSelect';
import { CampoData } from '@/components/condominios/CampoData';
import { TextoRico } from '@/components/ui/texto-rico';
import { UploadInfo } from '@/components/ui/upload-info';
import { enviarPrivado } from '@/lib/arquivos-privados';
import { comprimirImagem } from '@/lib/image-compress';
import { validarArquivoOficial } from '@/lib/documentos-oficiais';

export type CategoriaOficial = { id: string; nome: string };
export type DocumentoOficial = { id: string; titulo: string; categoria: string; categoria_id?: string; arquivo_url: string; nome_arquivo: string; descricao?: string; data_documento?: string | null; data_vencimento?: string | null; emissor?: string; numero_registro?: string; arquivo_tipo?: string; created_at?: string };
export function DocumentoOficialEditor({ doc, categorias, onClose, onSave, adicionarCategoria }: { doc: DocumentoOficial | null; categorias: CategoriaOficial[]; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<void>; adicionarCategoria?: () => void }) {
 const [f,setF] = useState({ titulo: doc?.titulo ?? '', categoria_id: doc?.categoria_id ?? '', descricao: doc?.descricao ?? '', data_documento: doc?.data_documento ?? '', data_vencimento: doc?.data_vencimento ?? '', emissor: doc?.emissor ?? '', numero_registro: doc?.numero_registro ?? '' });
 const [file,setFile] = useState<File | null>(null);
 const [busy,setBusy] = useState(false);
 function escolher(file?: File) { if (!file) return; if (!validarArquivoOficial(file)) { toast.error('Selecione um arquivo de até 20 MB.'); return; } setFile(file); }
 async function salvar() {
  const cat = categorias.find(c => c.id === f.categoria_id);
  if (!f.titulo.trim() || !cat || (!doc && !file)) return;
  setBusy(true);
  try {
   const otimizado = file ? await comprimirImagem(file,'chat') : null;
   const ref = otimizado ? await enviarPrivado(otimizado,'documentos-oficiais') : doc?.arquivo_url;
   await onSave({ ...f,titulo:f.titulo.trim(),categoria:cat.nome,data_documento:f.data_documento || null,data_vencimento:f.data_vencimento || null,arquivo_url:ref,nome_arquivo:otimizado?.name ?? doc?.nome_arquivo,arquivo_tipo:otimizado?.type ?? doc?.arquivo_tipo ?? '' });
   onClose();
  } catch(e) { toast.error((e as Error).message); } finally { setBusy(false); }
 }
 return <Sheet open onOpenChange={o => !o && !busy && onClose()}><SheetContent className="flex w-full flex-col gap-0 p-0 md:w-[60vw] sm:max-w-none">
  <SheetHeader className="shrink-0 border-b px-6 py-4"><SheetTitle>{doc ? 'Editar documento oficial' : 'Novo documento oficial'}</SheetTitle><SheetDescription className="sr-only">Dados do documento oficial</SheetDescription></SheetHeader>
  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
   <div className="space-y-1.5"><Label htmlFor="oficial-titulo">Título *</Label><Input id="oficial-titulo" value={f.titulo} disabled={busy} onChange={e=>setF({...f,titulo:e.target.value})} /></div>
   <div className="space-y-1.5"><Label>Categoria *</Label><div className="flex gap-2"><SearchSelect className="min-w-0 flex-1" value={f.categoria_id} options={categorias.map(c=>({value:c.id,label:c.nome}))} onChange={v=>setF({...f,categoria_id:v})} placeholder="Selecione a categoria" />{adicionarCategoria && <Button variant="outline" disabled={busy} onClick={adicionarCategoria}>Adicionar</Button>}</div></div>
   <div className="grid gap-4 sm:grid-cols-2">
    <div className="space-y-1.5"><Label htmlFor="oficial-data">Data do documento</Label><CampoData id="oficial-data" value={f.data_documento} disabled={busy} onChange={v=>setF({...f,data_documento:v})} /></div>
    <div className="space-y-1.5"><Label htmlFor="oficial-venc">Vencimento</Label><CampoData id="oficial-venc" value={f.data_vencimento} disabled={busy} onChange={v=>setF({...f,data_vencimento:v})} /></div>
    <div className="space-y-1.5"><Label htmlFor="oficial-emissor">Emissor / órgão / fornecedor</Label><Input id="oficial-emissor" value={f.emissor} disabled={busy} onChange={e=>setF({...f,emissor:e.target.value})} /></div>
    <div className="space-y-1.5"><Label htmlFor="oficial-numero">Nº do documento / apólice</Label><Input id="oficial-numero" value={f.numero_registro} disabled={busy} onChange={e=>setF({...f,numero_registro:e.target.value})} /></div>
   </div>
   <div className="space-y-1.5"><Label>Descrição</Label><TextoRico value={f.descricao} disabled={busy} onChange={v=>setF({...f,descricao:v})} /></div>
   <div className="space-y-2"><div className="flex items-center gap-2"><Label htmlFor="oficial-arquivo">{doc ? 'Substituir arquivo (opcional)' : 'Arquivo *'}</Label><UploadInfo perfil="chat" arquivos /></div>
    {doc && <p className="break-words text-sm text-muted-foreground">Atual: {doc.nome_arquivo}</p>}
    <label htmlFor="oficial-arquivo" className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed p-6 text-center hover:bg-muted/30" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy) escolher(e.dataTransfer.files[0]);}}><Paperclip className="size-6 text-primary" /><span className="break-all font-medium">{file?.name ?? 'Clique ou arraste o arquivo'}</span><span className="text-xs text-muted-foreground">PDF, imagem, Word, Excel ou PowerPoint, até 20 MB</span><input id="oficial-arquivo" type="file" disabled={busy} className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,image/*" onChange={e=>escolher(e.target.files?.[0])} /></label>
   </div>
  </div>
  <SheetFooter className="shrink-0 border-t px-6 py-4"><Button variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button disabled={busy || !f.titulo.trim() || !f.categoria_id || (!doc && !file)} onClick={()=>void salvar()}>{busy ? 'Salvando…' : 'Salvar'}</Button></SheetFooter>
 </SheetContent></Sheet>;
}
