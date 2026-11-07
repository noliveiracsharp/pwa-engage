import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Activity, AlertTriangle, Settings2, RotateCcw, CalendarClock, Eye, ExternalLink, Megaphone, Send, FileText, FolderOpen, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
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
import { CATEGORIAS_DOC, categoriasEfetivas, codigoCategoria, type CategoriaDoc, TAMANHO_MAX_DOC, VISIBILIDADES_DOC, diasParaVencer, nomeArquivoSeguro, statusValidade, type StatusValidade } from "@/lib/cond-documentos";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { CampoData } from "./CampoData";
import { s, useCondRows, useCondSalvar } from "./cond-data";
import { AvisoEditorDialog, LeiturasDialog, ReenviarDialog, StatusEnvioDialog, type DocumentoAviso } from "./AvisosPanel";
import { useAuth } from "@/hooks/useAuth";
import { rowId } from "@/lib/crud";
import { STATUS_AVISO, statusDoAviso } from "@/lib/cond-avisos-ciclo";

type Opt = { value: string; label: string };
const UM_ANO = 60 * 60 * 24 * 365;

type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
const BUCKET = "cond-documentos";
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

export function DocumentosPanel({ condominioId, perms, condominios, blocos, unidades }: { condominioId: string; perms: Perms; condominios: Opt[]; blocos: Row[]; unidades: Row[] }) {
  const { data: docs = [], isLoading } = useCondRows("cond_documentos", "condominio_id", condominioId);
  const { data: avisos = [] } = useCondRows("cond_avisos", "condominio_id", condominioId);
  const { empresa } = useAuth();
  const empresaId = String(rowId(empresa ?? {}));
  const nomeCond = condominios.find((c) => c.value === condominioId)?.label ?? "";
  const avisosDoDoc = (id: string) => avisos.filter((a) => s(a["documento_id"]) === id).sort((a, b) => s(b["created_at"]).localeCompare(s(a["created_at"])));
  const [envio, setEnvio] = useState<DocumentoAviso | null>(null);
  const [leituras, setLeituras] = useState<Row[] | null>(null);
  const [status, setStatus] = useState<Row | null>(null);
  const [reenviar, setReenviar] = useState<Row | null>(null);
  async function prepararEnvio(d: Row) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(s(d["arquivo_path"]), UM_ANO);
    if (error || !data) { toast.error("Não foi possível preparar o link do documento."); return; }
    setEnvio({ id: s(d["id"]), titulo: s(d["titulo"]), url: data.signedUrl, tipo: s(d["arquivo_tipo"]).startsWith("image/") ? "imagem" : "documento", nome: s(d["arquivo_nome"]) });
  }
  function verLeituras(d: Row) {
    const av = avisosDoDoc(s(d["id"]));
    if (!av.length) { toast.info("Este documento ainda não foi enviado aos moradores."); return; }
    setLeituras(av);
  }
  const salvar = useCondSalvar("cond_documentos");
  const { data: catRows = [] } = useCondRows("cond_documentos_categorias", "condominio_id", condominioId);
  const categorias = useMemo(() => categoriasEfetivas(catRows), [catRows]);
  const catLabel = (v: string) => categorias.find((c) => c.value === v)?.label ?? CATEGORIAS_DOC.find((c) => c.value === v)?.label ?? v;
  const [gerenciar, setGerenciar] = useState(false);
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
    ...categorias.map((c) => ({ value: c.value, label: c.label, n: contagem.get(c.value) ?? 0 })),
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
          {perms.canUpdate && (
            <button type="button" onClick={() => setGerenciar(true)} className="mt-1 flex shrink-0 items-center gap-2 rounded-md border-t px-2 pt-2 text-left text-sm text-muted-foreground hover:text-foreground">
              <Settings2 className="size-4" /> Gerenciar categorias
            </button>
          )}
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
                  {(() => { const ult = avisosDoDoc(s(d["id"]))[0]; if (!ult) return null; const st = statusDoAviso(ult["status"]); return <Badge variant="outline">{STATUS_AVISO[st].label}{st === "agendado" && ult["agendado_para"] ? ` · ${new Date(s(ult["agendado_para"])).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}</Badge>; })()}
                  <div className="flex">
                    <Button size="icon" variant="ghost" className="size-8" aria-label="Quem visualizou" onClick={() => verLeituras(d)}><Eye className="size-4" /></Button>
                    <Button size="icon" variant="ghost" className="size-8" aria-label="Abrir documento" onClick={() => abrir(d)}><ExternalLink className="size-4" /></Button>
                    {perms.canCreate && <Button size="icon" variant="ghost" className="size-8" aria-label="Enviar ou agendar para moradores" onClick={() => prepararEnvio(d)}><Megaphone className="size-4" /></Button>}
                    {avisosDoDoc(s(d["id"]))[0] && <Button size="icon" variant="ghost" className="size-8" aria-label="Status do envio" onClick={() => setStatus(avisosDoDoc(s(d["id"]))[0]!)}><Activity className="size-4" /></Button>}
                    {perms.canCreate && avisosDoDoc(s(d["id"]))[0] && <Button size="icon" variant="ghost" className="size-8" aria-label="Reenviar" onClick={() => setReenviar(avisosDoDoc(s(d["id"]))[0]!)}><Send className="size-4" /></Button>}
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
        <DocumentoDialog categorias={categorias} condominioId={condominioId} doc={editando} categoriaInicial={cat} onClose={() => setEditando(undefined)} salvar={salvar.mutateAsync} aoCriar={(d) => void prepararEnvio(d)} />
      )}
      {envio && <AvisoEditorDialog documento={envio} condominioId={condominioId} condominios={condominios} blocos={blocos} unidades={unidades} empresaId={empresaId} onClose={() => setEnvio(null)} />}
      {leituras && <LeiturasDialog avisos={leituras} onClose={() => setLeituras(null)} />}
      {status && <StatusEnvioDialog aviso={status} onClose={() => setStatus(null)} />}
      {reenviar && <ReenviarDialog aviso={reenviar} empresaId={empresaId} nomeCondominio={nomeCond} onClose={() => setReenviar(null)} />}

      {gerenciar && <CategoriasDialog condominioId={condominioId} rows={catRows} contagem={contagem} onClose={() => setGerenciar(false)} />}

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

function DocumentoDialog({ categorias, condominioId, doc, categoriaInicial, onClose, salvar, aoCriar }: {
  categorias: CategoriaDoc[]; condominioId: string; doc: Row | null; categoriaInicial: string; onClose: () => void; aoCriar: (d: Row) => void;
  salvar: (a: { id?: string; valores?: Row }) => Promise<void>;
}) {
  const inicialCat = doc ? s(doc["categoria"]) : categorias.some((c) => c.value === categoriaInicial) ? categoriaInicial : (categorias.find((c) => c.value === "outros") ?? categorias[0])?.value ?? "outros";
  const [categoria, setCategoria] = useState(inicialCat);
  const [titulo, setTitulo] = useState(s(doc?.["titulo"]));
  const [descricao, setDescricao] = useState(s(doc?.["descricao"]));
  const [visibilidade, setVisibilidade] = useState(s(doc?.["visibilidade"]) || "moradores");
  const [dataDoc, setDataDoc] = useState(s(doc?.["data_documento"]).slice(0, 10));
  const [venc, setVenc] = useState(s(doc?.["data_vencimento"]).slice(0, 10));
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [avisar, setAvisar] = useState(!doc);
  const pedeVenc = categorias.find((c) => c.value === categoria)?.vence ?? false;
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
        const up = await supabase.storage.from(BUCKET).upload(path, arquivo, arquivo.type ? { contentType: arquivo.type } : {});
        if (up.error) throw up.error;
        Object.assign(valores, { arquivo_path: path, arquivo_nome: arquivo.name, arquivo_tipo: arquivo.type, arquivo_tamanho: arquivo.size });
        if (doc) await supabase.storage.from(BUCKET).remove([s(doc["arquivo_path"])]);
      }
      await salvar(doc ? { id: s(doc["id"]), valores } : { valores });
      toast.success(doc ? "Documento atualizado." : "Documento enviado.");
      let criado: Row | null = null;
      if (!doc && avisar && valores["arquivo_path"]) {
        const { data } = await supabase.from("cond_documentos" as never).select("*").eq("arquivo_path", s(valores["arquivo_path"])).maybeSingle();
        criado = (data as Row | null) ?? null;
      }
      onClose();
      if (criado) aoCriar(criado);
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
          <div><Label className="mb-1.5 block">Categoria</Label><SearchSelect value={categoria} allowClear={false} options={categorias.map((c) => ({ value: c.value, label: c.label }))} onChange={setCategoria} /></div>
          <div><Label className="mb-1.5 block">Quem pode ver</Label><SearchSelect value={visibilidade} allowClear={false} options={[...VISIBILIDADES_DOC]} onChange={setVisibilidade} /></div>
          <div><Label htmlFor="doc-data" className="mb-1.5 flex h-5 items-center gap-1">Data do documento</Label><CampoData id="doc-data" value={dataDoc} onChange={setDataDoc} inicio={1970} /></div>
          <div>
            <Label htmlFor="doc-venc" className="mb-1.5 flex h-5 items-center gap-1"><CalendarClock className="size-3.5" /> Vencimento {pedeVenc && <span className="text-xs text-muted-foreground">(recomendado)</span>}</Label>
            <CampoData id="doc-venc" value={venc} onChange={setVenc} inicio={2000} />
          </div>
          <div className="sm:col-span-2"><Label htmlFor="doc-desc">Descrição</Label><Textarea id="doc-desc" rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
          <div className="sm:col-span-2">
            <Label htmlFor="doc-arq">{doc ? "Substituir arquivo (opcional)" : "Arquivo *"}</Label>
            <Input id="doc-arq" type="file" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            <p className="mt-1 text-xs text-muted-foreground">PDF, imagem, Word ou Excel, até 20 MB.{doc && !arquivo ? ` Atual: ${s(doc["arquivo_nome"]) || "arquivo enviado"}` : ""}</p>
          </div>
          {!doc && <label className="flex items-center gap-2 rounded-md border p-3 text-sm sm:col-span-2"><Switch checked={avisar} onCheckedChange={setAvisar} /> <span>Avisar os moradores ao salvar <span className="block text-xs text-muted-foreground">Você escolhe enviar agora ou agendar, e acompanha quem abriu por e-mail ou WhatsApp.</span></span></label>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enviando}>Cancelar</Button>
          <Button onClick={gravar} disabled={!valido || enviando}>{enviando && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoriasDialog({ condominioId, rows, contagem, onClose }: { condominioId: string; rows: Row[]; contagem: Map<string, number>; onClose: () => void }) {
  const salvar = useCondSalvar("cond_documentos_categorias");
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [vence, setVence] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const lista = categoriasEfetivas(rows);

  /** Primeira personalização: grava a lista padrão no condomínio. */
  async function garantirProprias(): Promise<void> {
    if (rows.length) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("cond_documentos_categorias").insert(
      CATEGORIAS_DOC.map((c) => ({ condominio_id: condominioId, codigo: c.value, descricao: c.label, controla_vencimento: c.vence })));
    if (error) throw error;
  }
  async function idDe(codigo: string): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from("cond_documentos_categorias").select("id").eq("condominio_id", condominioId).eq("codigo", codigo).single();
    if (error) throw error;
    return data.id as string;
  }
  async function executar(fn: () => Promise<void>) {
    setOcupado(true);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível salvar."); } finally { setOcupado(false); }
  }
  const adicionar = () => executar(async () => {
    const n = nome.trim();
    if (!n) return;
    if (lista.some((c) => c.label.toLowerCase() === n.toLowerCase())) { toast.error("Já existe uma categoria com esse nome."); return; }
    await garantirProprias();
    await salvar.mutateAsync({ valores: { condominio_id: condominioId, codigo: codigoCategoria(n, lista.map((c) => c.value)), descricao: n, controla_vencimento: vence } });
    setNome(""); setVence(false); toast.success("Categoria adicionada.");
  });
  const alterar = (c: CategoriaDoc, valores: Row) => executar(async () => {
    await garantirProprias();
    await salvar.mutateAsync({ id: c.id || (await idDe(c.value)), valores });
  });
  const excluir = async (c: CategoriaDoc) => {
    if ((contagem.get(c.value) ?? 0) > 0) { toast.error(`"${c.label}" tem documentos. Mova-os para outra categoria antes de excluir.`); return; }
    if (!(await confirmar({ title: `Excluir a categoria "${c.label}"?`, destructive: true, confirmText: "Excluir" }))) return;
    executar(async () => { await garantirProprias(); await salvar.mutateAsync({ id: c.id || (await idDe(c.value)), excluir: true }); toast.success("Categoria excluída."); });
  };
  const restaurar = async () => {
    if (!(await confirmar({ title: "Restaurar categorias padrão?", description: "Categorias padrão que faltam serão recriadas. As suas continuam.", confirmText: "Restaurar" }))) return;
    executar(async () => {
      const faltam = CATEGORIAS_DOC.filter((c) => !rows.some((r) => s(r["codigo"]) === c.value));
      if (rows.length && faltam.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("cond_documentos_categorias").insert(faltam.map((c) => ({ condominio_id: condominioId, codigo: c.value, descricao: c.label, controla_vencimento: c.vence })));
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ["cond", "cond_documentos_categorias"] });
      }
      toast.success("Categorias padrão restauradas.");
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !ocupado && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Categorias de documentos</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Estas categorias valem só para este condomínio.</p>
        <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-md border">
          {lista.map((c) => (
            <li key={c.value} className="flex items-center gap-2 p-2">
              <Input defaultValue={c.label} aria-label="Nome da categoria" className="h-8 flex-1" disabled={ocupado}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.label) alterar(c, { descricao: v }); else e.target.value = c.label; }} />
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Controla data de vencimento">
                <Switch checked={c.vence} disabled={ocupado} onCheckedChange={(v) => alterar(c, { controla_vencimento: v })} /> Vence
              </label>
              <span className="w-6 text-center text-xs text-muted-foreground">{contagem.get(c.value) ?? 0}</span>
              <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label={`Excluir ${c.label}`} disabled={ocupado} onClick={() => excluir(c)}><Trash2 className="size-4" /></Button>
            </li>
          ))}
        </ul>
        <div className="flex items-end gap-2 rounded-md border border-dashed p-2">
          <div className="flex-1"><Label htmlFor="cat-nova">Nova categoria</Label>
            <Input id="cat-nova" value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && adicionar()} placeholder="Ex.: Obras e reformas" /></div>
          <label className="flex items-center gap-1.5 pb-2 text-xs text-muted-foreground"><Switch checked={vence} onCheckedChange={setVence} /> Vence</label>
          <Button onClick={adicionar} disabled={!nome.trim() || ocupado}><Plus className="size-4" /> Adicionar</Button>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={restaurar} disabled={ocupado}><RotateCcw className="size-4" /> Restaurar padrão</Button>
          <Button onClick={onClose} disabled={ocupado}>{ocupado && <Loader2 className="size-4 animate-spin" />} Concluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
