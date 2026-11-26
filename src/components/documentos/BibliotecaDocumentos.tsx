import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, FileText, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAudit } from '@/lib/audit';
import { urlAssinada } from '@/lib/arquivos-privados';
import { abrirArquivo } from '@/components/layout/VisualizadorArquivo';
import { confirmar } from '@/components/layout/DialogoGlobal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DocumentoOficialEditor, type DocumentoOficial, type CategoriaOficial } from './DocumentoOficialEditor';
import { chaveCategoria } from '@/lib/documentos-oficiais';
import { htmlParaTexto } from '@/lib/html-texto';
import { cn } from '@/lib/utils';
export type { DocumentoOficial } from './DocumentoOficialEditor';
const db = supabase as any;
export function BibliotecaDocumentos({ selecionar, canCreate=false, canUpdate=false, canDelete=false }: { selecionar?: (docs: DocumentoOficial[])=>Promise<void>; canCreate?: boolean; canUpdate?: boolean; canDelete?: boolean }) {
 const { empresaId }=useAudit(); const qc=useQueryClient();
 const [busca,setBusca]=useState(''); const [cat,setCat]=useState(''); const [selecionados,setSelecionados]=useState<string[]>([]);
 const [edit,setEdit]=useState<DocumentoOficial | null | undefined>(); const [gerenciar,setGerenciar]=useState(false);
 const [nome,setNome]=useState(''); const [catEdit,setCatEdit]=useState<string | null>(null); const [busy,setBusy]=useState(false); const [limite,setLimite]=useState(200);
 const {data:docs=[],isLoading,error}=useQuery({queryKey:['documentos-oficiais',empresaId,limite],enabled:!!empresaId,queryFn:async():Promise<DocumentoOficial[]>=>{
  const {data,error}=await db.from('documentos_oficiais').select('*').eq('empresa_id',empresaId).eq('ativo',true).order('titulo').order('id').limit(limite); if(error) throw error; return data ?? [];
 }});
 const {data:categorias=[],error:erroCategorias}=useQuery({queryKey:['documentos-oficiais-categorias',empresaId],enabled:!!empresaId,queryFn:async():Promise<CategoriaOficial[]>=>{
  const {data,error}=await db.from('documentos_oficiais_categorias').select('id,nome').eq('empresa_id',empresaId).order('nome');if(error)throw error;return (data ?? []).sort((a:CategoriaOficial,b:CategoriaOficial)=>a.nome.localeCompare(b.nome,'pt-BR'));
 }});
 async function atualizar(){await Promise.all([qc.invalidateQueries({queryKey:['documentos-oficiais']}),qc.invalidateQueries({queryKey:['documentos-oficiais-categorias']})]);}
 const filtrados=docs.filter(d=>(!cat || d.categoria_id===cat) && chaveCategoria(`${d.titulo} ${htmlParaTexto(d.descricao ?? '')} ${d.nome_arquivo} ${d.emissor ?? ''} ${d.numero_registro ?? ''}`).includes(chaveCategoria(busca)));
 async function salvarCategoria(){
  if(!empresaId || !nome.trim() || (catEdit ? !canUpdate : !canCreate))return;
  if(categorias.some(c=>c.id!==catEdit && chaveCategoria(c.nome)===chaveCategoria(nome))){toast.error('Já existe uma categoria com esse nome.');return;}
  setBusy(true);try{
   const {error}=catEdit ? await db.from('documentos_oficiais_categorias').update({nome:nome.trim()}).eq('id',catEdit).eq('empresa_id',empresaId).select().single() : await db.from('documentos_oficiais_categorias').insert({empresa_id:empresaId,nome:nome.trim()}).select().single();
   if(error)throw error;await atualizar();setNome('');setCatEdit(null);toast.success('Categoria salva.');
  }catch(e){toast.error((e as Error).message);}finally{setBusy(false);}
 }
 async function excluirCategoria(c:CategoriaOficial){
  if(!canDelete || !await confirmar(`Excluir a categoria "${c.nome}"?`))return;
  const {error}=await db.from('documentos_oficiais_categorias').delete().eq('id',c.id).eq('empresa_id',empresaId).select().single();
  if(error){toast.error(error.code==='23503'?'Mova os documentos para outra categoria antes de excluir.':error.message);return;}if(cat===c.id)setCat('');await atualizar();
 }
 async function salvarDocumento(payload:Record<string,unknown>){
  if(!empresaId || (edit ? !canUpdate : !canCreate))throw new Error('Você não tem permissão para salvar.');
  const {error}=edit ? await db.from('documentos_oficiais').update(payload).eq('id',edit.id).eq('empresa_id',empresaId).select().single() : await db.from('documentos_oficiais').insert({...payload,empresa_id:empresaId}).select().single();
  if(error)throw error;await atualizar();toast.success('Documento salvo.');
 }
 async function visualizar(d:DocumentoOficial){try{abrirArquivo({url:await urlAssinada(d.arquivo_url),titulo:d.titulo,nome:d.nome_arquivo,tipo:d.arquivo_tipo});}catch(e){toast.error((e as Error).message);}}
 async function excluir(d:DocumentoOficial){if(!canDelete || !await confirmar(`Excluir o documento "${d.titulo}" da biblioteca?`))return;const {error}=await db.from('documentos_oficiais').delete().eq('id',d.id).eq('empresa_id',empresaId).select().single();if(error)toast.error(error.message);else await atualizar();}
 async function anexar(){if(!selecionar)return;setBusy(true);try{await selecionar(docs.filter(d=>selecionados.includes(d.id)));setSelecionados([]);}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}
 const pastas=[{id:'',nome:'Todos os documentos'},...categorias];
 return <div className="flex min-h-0 flex-col gap-4">
  {canCreate && <div className="flex justify-end"><Button disabled={!!erroCategorias} onClick={()=>setEdit(null)}><Plus className="size-4" />Novo documento</Button></div>}
  {erroCategorias && <p role="alert" className="text-sm text-destructive">Aplique o script complementar dos Documentos Oficiais para habilitar categorias e edição completa.</p>}
  <div className="grid min-h-0 gap-5 md:grid-cols-[240px_minmax(0,1fr)]">
   <aside className="flex flex-col gap-1 md:border-r md:pr-4"><div className="max-h-64 overflow-y-auto md:max-h-[55vh]">{pastas.map(c=><Button key={c.id} variant="ghost" className={cn('mb-1 w-full justify-between gap-2',cat===c.id && 'bg-primary/10 text-primary')} onClick={()=>setCat(c.id)}><span className="truncate" title={c.nome}>{c.nome}</span><Badge variant="secondary">{c.id?docs.filter(d=>d.categoria_id===c.id).length:docs.length}{docs.length===limite?'+':''}</Badge></Button>)}</div>{(canCreate || canUpdate || canDelete) && <Button variant="ghost" className="justify-start border-t text-muted-foreground" disabled={!!erroCategorias} onClick={()=>setGerenciar(true)}><Settings2 className="size-4" />Gerenciar categorias</Button>}</aside>
   <div className="min-w-0 space-y-3"><Input aria-label="Pesquisar documentos" placeholder="Buscar por título, descrição ou arquivo" value={busca} onChange={e=>setBusca(e.target.value)} />
    <div className="max-h-[55vh] divide-y divide-border overflow-y-auto">{isLoading && <p className="py-4 text-muted-foreground">Carregando…</p>}{error && <p role="alert" className="py-4 text-destructive">Não foi possível carregar os documentos.</p>}{!isLoading && !error && !filtrados.length && <p className="py-4 text-muted-foreground">Nenhum documento encontrado.</p>}
     {filtrados.map(d=><div key={d.id} className="flex flex-wrap items-center gap-3 py-4">{selecionar && <Checkbox aria-label={`Selecionar ${d.titulo}`} checked={selecionados.includes(d.id)} disabled={busy} onCheckedChange={v=>setSelecionados(ids=>v?[...ids,d.id]:ids.filter(id=>id!==d.id))} />}<div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10"><FileText className="size-5 text-primary" /></div><div className="min-w-0 flex-1"><p className="break-words font-semibold">{d.titulo}</p><p className="break-words text-xs text-muted-foreground">{d.categoria}{(d.data_documento || d.created_at) && ` · ${new Date(`${(d.data_documento || d.created_at || '').slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR')}`}{d.emissor && ` · ${d.emissor}`}</p><p className="break-words text-xs text-muted-foreground">{d.nome_arquivo}</p></div><div className="ml-auto flex shrink-0 gap-1"><Button variant="ghost" size="icon" tooltip="Visualizar documento" aria-label={`Visualizar ${d.titulo}`} onClick={()=>void visualizar(d)}><Eye className="size-4" /></Button>{canUpdate && <Button variant="ghost" size="icon" tooltip="Editar documento" aria-label={`Editar ${d.titulo}`} onClick={()=>setEdit(d)}><Pencil className="size-4" /></Button>}{canDelete && <Button variant="ghost" size="icon" className="text-destructive" tooltip="Excluir documento" aria-label={`Excluir ${d.titulo}`} onClick={()=>void excluir(d)}><Trash2 className="size-4" /></Button>}</div></div>)}
    </div>{docs.length===limite && <Button variant="outline" onClick={()=>setLimite(v=>v+200)}>Carregar mais documentos</Button>}
   </div>
  </div>
  {selecionar && <div className="flex justify-end border-t pt-3"><Button disabled={busy || !selecionados.length} onClick={()=>void anexar()}>Anexar selecionados ({selecionados.length})</Button></div>}
  {edit!==undefined && <DocumentoOficialEditor doc={edit} categorias={categorias} onClose={()=>setEdit(undefined)} onSave={salvarDocumento} {...(canCreate?{adicionarCategoria:()=>setGerenciar(true)}:{})} />}
  <Dialog open={gerenciar} onOpenChange={o=>!busy && setGerenciar(o)}><DialogContent><DialogHeader><DialogTitle>Gerenciar categorias</DialogTitle><DialogDescription className="sr-only">Categorias de documentos da empresa</DialogDescription></DialogHeader>
   {(canCreate || (catEdit && canUpdate)) && <form className="flex gap-2" onSubmit={e=>{e.preventDefault();void salvarCategoria();}}><Input aria-label="Nome da categoria" placeholder="Nome da categoria" value={nome} disabled={busy} onChange={e=>setNome(e.target.value)} /><Button disabled={busy || !nome.trim()} type="submit">{catEdit?'Salvar':'Adicionar'}</Button>{catEdit && <Button variant="outline" onClick={()=>{setCatEdit(null);setNome('');}}>Cancelar</Button>}</form>}
   <div className="max-h-[50vh] divide-y overflow-y-auto">{categorias.map(c=><div key={c.id} className="flex items-center gap-2 py-2"><span className="min-w-0 flex-1 break-words">{c.nome}</span>{canUpdate && <Button variant="ghost" size="icon" tooltip="Renomear categoria" aria-label={`Renomear ${c.nome}`} onClick={()=>{setCatEdit(c.id);setNome(c.nome);}}><Pencil className="size-4" /></Button>}{canDelete && <Button variant="ghost" size="icon" tooltip="Excluir categoria" aria-label={`Excluir categoria ${c.nome}`} onClick={()=>void excluirCategoria(c)}><Trash2 className="size-4" /></Button>}</div>)}</div>
   <Button variant="outline" disabled={busy} onClick={()=>setGerenciar(false)}>Fechar</Button>
  </DialogContent></Dialog>
 </div>;
}
