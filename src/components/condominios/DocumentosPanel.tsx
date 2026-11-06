import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Eye, FileText, FolderOpen, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORIAS_DOC, TAMANHO_MAX_DOC, VISIBILIDADES_DOC, diasParaVencer, nomeArquivoSeguro, statusValidade, type StatusValidade } from "@/lib/cond-documentos";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { CampoData } from "./CampoData";
import { s, useCondRows, useCondSalvar } from "./cond-data";

type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
const BUCKET = "cond-documentos";
const catLabel = (v: string) => CATEGORIAS_DOC.find((c) => c.value === v)?.label ?? v;
const visLabel = (v: string) => VISIBILIDADES_DOC.find((c) => c.value === v)?.label ?? v;
const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const dataBR = (iso: unknown) => (iso ? new Date(`${s(iso).slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR") : "—");

function BadgeValidade({ venc }: { venc: string }) {
  const st = statusValidade(venc);
  if (st === "sem") return null;
  const d = diasParaVencer(venc);
  const cls: Record<Exclude<StatusValidade, "sem">, string> = {
    valido: "border-success/40 bg-success/10 text-success",
    a_vencer: "border-warning/40 bg-warning/10 text-warning",
    vencido: "border-destructive/40 bg-destructive/10 text-destructive",
  };
  const txt = st === "vencido" ? `Vencido há ${-d} dia(s)` : st === "a_vencer" ? (d === 0 ? "Vence hoje" : `Vence em ${d} dia(s)`) : `Válido até ${dataBR(venc)}`;
  return <Badge variant="outline" className={cls[st]}>{txt}</Badge>;
}

export function DocumentosPanel({ condominioId, perms }: { condominioId: string; perms: Perms }) {
  const { data: docs = [], isLoading } = useCondRows("cond_documentos", "condominio_id", condominioId);
  const salvar = useCondSalvar("cond_documentos");
  const [cat, setCat] = useState("todas");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Row | null | undefined>(undefined);
  const [previa, setPrevia] = useState<{ url: string; tipo: string; titulo: string } | null>(null);

  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs) m.set(s(d["categoria"]), (m.get(s(d["categoria"])) ?? 0) + 1);
    return m;
  }, [docs]);
  const alertas = useMemo(() => docs.filter((d) => ["vencido", "a_vencer"].includes(statusValidade(s(d["data_vencimento"]) || null))), [docs]);
  const lista = useMemo(() => {
    const t = norm(busca.trim());
    return docs
      .filter((d) => cat === "todas" || (cat === "alertas" ? alertas.includes(d) : s(d["categoria"]) === cat))
      .filter((d) => !t || norm(`${s(d["titulo"])} ${s(d["descricao"])} ${s(d["arquivo_nome"])}`).includes(t))
      .sort((a, b) => s(b["data_documento"] || b["created_at"]).localeCompare(s(a["data_documento"] || a["created_at"])));
  }, [docs, cat, busca, alertas]);

  async function abrir(d: Row) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(s(d["arquivo_path"]), 600);
    if (error || !data) { toast.error("Não foi possível abrir o documento."); return; }
    const tipo = s(d["arquivo_tipo"]);
    if (tipo === "application/pdf" || tipo.startsWith("image/")) setPrevia({ url: data.signedUrl, tipo, titulo: s(d["titulo"]) });
    else window.open(data.signedUrl, "_blank", "noopener");
  }
  async function excluir(d: Row) {
    if (!(await confirmar({ title: `Excluir "${s(d["titulo"])}"?`, description: "O arquivo será removido definitivamente.", destructive: true, confirmText: "Excluir" }))) return;
    await supabase.storage.from(BUCKET).remove([s(d["arquivo_path"])]);
    await salvar.mutateAsync({ id: s(d["id"]), excluir: true });
    toast.success("Documento excluído.");
  }

  const pastas = [
    { value: "todas", label: "Todos os documentos", n: docs.length },
    ...(alertas.length ? [{ value: "alertas", label: "Vencidos / a vencer", n: alertas.length }] : []),
    ...CATEGORIAS_DOC.map((c) => ({ value: c.value, label: c.label, n: contagem.get(c.value) ?? 0 })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><FolderOpen className="size-5" /> Documentos do condomínio</h2>
          <p className="text-sm text-muted-foreground">Atas, regimento, laudos, apólices e contratos em uma pasta digital.</p>
        </div>
        {perms.canCreate && <Button onClick={() => setEditando(null)}><Plus className="size-4" /> Enviar documento</Button>}
      </div>

      {alertas.length > 0 && (
        <button type="button" onClick={() => setCat("alertas")} className="flex w-full items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-left text-sm text-warning hover:bg-warning/15">
          <AlertTriangle className="size-4 shrink-0" />
          <span><strong>{alertas.length}</strong> documento(s) vencido(s) ou vencendo nos próximos 30 dias. Clique para ver.</span>
        </button>
      )}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <nav className="flex gap-1 overflow-x-auto rounded-lg border bg-card p-2 lg:flex-col" aria-label="Pastas">
          {pastas.map((p) => (
            <button key={p.value} type="button" aria-current={cat === p.value ? "true" : undefined} onClick={() => setCat(p.value)}
              className={cn("flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", cat === p.value && "bg-primary/10 font-semibold text-primary")}>
              <span className="flex-1 truncate">{p.label}</span>
              <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{p.n}</span>
            </button>
          ))}
        </nav>

        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por título, descrição ou arquivo" className="px-8" aria-label="Buscar documento" />
            {busca && <button type="button" className="absolute right-2.5 top-2.5 text-muted-foreground" aria-label="Limpar busca" onClick={() => setBusca("")}><X className="size-4" /></button>}
          </div>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : lista.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              <FileText className="mx-auto mb-2 size-8 opacity-60" />
              {busca || cat !== "todas" ? "Nenhum documento encontrado." : "Nenhum documento enviado ainda."}
            </div>
          ) : (
            <ul className="divide-y">
              {lista.map((d) => (
                <li key={s(d["id"])} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><FileText className="size-5" /></div>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => abrir(d)}>
                    <p className="truncate font-medium hover:underline">{s(d["titulo"])}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {catLabel(s(d["categoria"]))} · {dataBR(d["data_documento"] || d["created_at"])} · {visLabel(s(d["visibilidade"]))}
                    </p>
                  </button>
                  {s(d["data_vencimento"]) && <BadgeValidade venc={s(d["data_vencimento"])} />}
                  <div className="flex">
                    <Button size="icon" variant="ghost" className="size-8" aria-label="Visualizar" onClick={() => abrir(d)}><Eye className="size-4" /></Button>
                    {perms.canUpdate && <Button size="icon" variant="ghost" className="size-8" aria-label="Editar" onClick={() => setEditando(d)}><Pencil className="size-4" /></Button>}
                    {perms.canDelete && <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label="Excluir" onClick={() => excluir(d)}><Trash2 className="size-4" /></Button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {editando !== undefined && (
        <DocumentoDialog condominioId={condominioId} doc={editando} categoriaInicial={cat} onClose={() => setEditando(undefined)} salvar={salvar.mutateAsync} />
      )}

      <Dialog open={!!previa} onOpenChange={(o) => !o && setPrevia(null)}>
        <DialogContent className="flex h-[90vh] max-w-5xl flex-col">
          <DialogHeader><DialogTitle>{previa?.titulo}</DialogTitle></DialogHeader>
          {previa && (previa.tipo.startsWith("image/")
            ? <img src={previa.url} alt={previa.titulo} className="min-h-0 flex-1 rounded-md object-contain" />
            : <iframe src={previa.url} title={previa.titulo} className="min-h-0 w-full flex-1 rounded-md border" />)}
          <DialogFooter>
            <Button variant="outline" onClick={() => previa && window.open(previa.url, "_blank", "noopener")}>Abrir em nova aba</Button>
            <Button onClick={() => setPrevia(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentoDialog({ condominioId, doc, categoriaInicial, onClose, salvar }: {
  condominioId: string; doc: Row | null; categoriaInicial: string; onClose: () => void;
  salvar: (a: { id?: string; valores?: Row }) => Promise<void>;
}) {
  const inicialCat = doc ? s(doc["categoria"]) : CATEGORIAS_DOC.some((c) => c.value === categoriaInicial) ? categoriaInicial : "outros";
  const [categoria, setCategoria] = useState(inicialCat);
  const [titulo, setTitulo] = useState(s(doc?.["titulo"]));
  const [descricao, setDescricao] = useState(s(doc?.["descricao"]));
  const [visibilidade, setVisibilidade] = useState(s(doc?.["visibilidade"]) || "moradores");
  const [dataDoc, setDataDoc] = useState(s(doc?.["data_documento"]).slice(0, 10));
  const [venc, setVenc] = useState(s(doc?.["data_vencimento"]).slice(0, 10));
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const pedeVenc = CATEGORIAS_DOC.find((c) => c.value === categoria)?.vence ?? false;
  const valido = titulo.trim() && (doc || arquivo);

  async function gravar() {
    if (arquivo && arquivo.size > TAMANHO_MAX_DOC) { toast.error("Arquivo maior que 20 MB."); return; }
    setEnviando(true);
    try {
      const valores: Row = {
        condominio_id: condominioId, categoria, titulo: titulo.trim(), descricao: descricao.trim() || null,
        visibilidade, data_documento: dataDoc || null, data_vencimento: venc || null, updated_at: new Date().toISOString(),
      };
      if (arquivo) {
        const path = `condominio/${condominioId}/${categoria}/${Date.now()}-${nomeArquivoSeguro(arquivo.name)}`;
        const up = await supabase.storage.from(BUCKET).upload(path, arquivo, { contentType: arquivo.type || undefined });
        if (up.error) throw up.error;
        Object.assign(valores, { arquivo_path: path, arquivo_nome: arquivo.name, arquivo_tipo: arquivo.type, arquivo_tamanho: arquivo.size });
        if (doc) await supabase.storage.from(BUCKET).remove([s(doc["arquivo_path"])]);
      }
      await salvar({ id: doc ? s(doc["id"]) : undefined, valores });
      toast.success(doc ? "Documento atualizado." : "Documento enviado.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar o documento.");
    } finally { setEnviando(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !enviando && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{doc ? "Editar documento" : "Enviar documento"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label htmlFor="doc-tit">Título *</Label><Input id="doc-tit" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Ata da AGO 2026" /></div>
          <div><Label className="mb-1.5 block">Categoria</Label><SearchSelect value={categoria} allowClear={false} options={[...CATEGORIAS_DOC]} onChange={setCategoria} /></div>
          <div><Label className="mb-1.5 block">Quem pode ver</Label><SearchSelect value={visibilidade} allowClear={false} options={[...VISIBILIDADES_DOC]} onChange={setVisibilidade} /></div>
          <div><Label htmlFor="doc-data">Data do documento</Label><CampoData id="doc-data" value={dataDoc} onChange={setDataDoc} inicio={1970} /></div>
          <div>
            <Label htmlFor="doc-venc" className="flex items-center gap-1"><CalendarClock className="size-3.5" /> Vencimento {pedeVenc && <span className="text-xs text-muted-foreground">(recomendado)</span>}</Label>
            <CampoData id="doc-venc" value={venc} onChange={setVenc} inicio={2000} />
          </div>
          <div className="sm:col-span-2"><Label htmlFor="doc-desc">Descrição</Label><Textarea id="doc-desc" rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
          <div className="sm:col-span-2">
            <Label htmlFor="doc-arq">{doc ? "Substituir arquivo (opcional)" : "Arquivo *"}</Label>
            <Input id="doc-arq" type="file" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            <p className="mt-1 text-xs text-muted-foreground">PDF, imagem, Word ou Excel, até 20 MB.{doc && !arquivo ? ` Atual: ${s(doc["arquivo_nome"]) || "arquivo enviado"}` : ""}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button onClick={gravar} disabled={!valido || enviando}>{enviando && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
