import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, FileText, Link2, Paperclip, Printer, Send, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { useAuth } from "@/hooks/useAuth";
import { useAudit } from "@/lib/audit";
import { formatDate } from "@/lib/orcamentos";
import { cn } from "@/lib/utils";
import type { Row } from "@/lib/row";
import {
  carimboAssinatura,
  diasParaVencer,
  linkAssinaturaDoc,
  novoTokenDoc,
  renderModelo,
  STATUS_DOC,
  statusDoc,
  variaveisDe,
  type EntidadeDoc,
} from "@/lib/documentos";

const db = supabase as any;

export type DocumentoRow = {
  id: string;
  modelo_id: string | null;
  titulo: string;
  entidade_tipo: EntidadeDoc;
  entidade_id: string;
  entidade_nome: string | null;
  conteudo: string;
  status: string;
  dt_emissao: string;
  dt_assinatura: string | null;
  dt_vencimento: string | null;
  anexo_url: string | null;
  observacoes: string | null;
  exige_assinatura_digital?: boolean;
  token_publico?: string | null;
  assinado_em?: string | null;
  assinado_nome?: string | null;
  assinado_documento?: string | null;
  assinado_ip?: string | null;
  assinado_hash?: string | null;
};

export function useModelos() {
  return useQuery({
    queryKey: ["documento_modelos"],
    queryFn: async () => {
      const { data, error } = await db.from("documento_modelos").select("*").order("titulo");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
}

export function StatusDocBadge({ status }: { status: unknown }) {
  const s = statusDoc(status);
  return <span className={cn("rounded px-2 py-0.5 text-xs font-medium", s.badge)}>{s.label}</span>;
}

export function VencimentoInfo({ data }: { data: unknown }) {
  const d = diasParaVencer(data);
  if (d === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn(d < 0 ? "text-destructive" : d <= 30 ? "text-warning" : "")}>
      {formatDate(data)}
      {d < 0 ? " (vencido)" : d <= 30 ? ` (${d}d)` : ""}
    </span>
  );
}

export function imprimirDocumento(titulo: string, conteudo: string) {
  const w = window.open("", "_blank");
  if (!w) return void toast.error("Libere pop-ups para imprimir.");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  w.document.write(
    `<html><head><title>${esc(titulo)}</title><style>@page{size:A4;margin:22mm}body{font:12pt/1.6 Georgia,serif;white-space:pre-wrap;color:#000}</style></head><body>${esc(conteudo)}</body></html>`,
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

type EditorProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  doc: Partial<DocumentoRow> | null;
  canEdit: boolean;
};

/** Edita um documento emitido: texto, situação, datas e via assinada. */
export function DocumentoEditor({ open, onOpenChange, doc, canEdit }: EditorProps) {
  const qc = useQueryClient();
  const { stamp } = useAudit();
  const [v, setV] = useState<Partial<DocumentoRow>>({});
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (open) setV(doc ?? {});
  }, [open, doc]);

  async function anexar(file: File) {
    setEnviando(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const path = `documentos/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("chat_media").upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (error) throw error;
      const url = supabase.storage.from("chat_media").getPublicUrl(path).data.publicUrl;
      setV((p) => ({ ...p, anexo_url: url, status: "assinado", dt_assinatura: p.dt_assinatura || new Date().toISOString().slice(0, 10) }));
    } catch (e: any) {
      toast.error("Falha ao enviar arquivo", { description: e?.message });
    } finally {
      setEnviando(false);
    }
  }

  async function salvar() {
    if (!v.titulo?.trim()) return void toast.error("Informe o título.");
    setSalvando(true);
    const payload: Row = {
      modelo_id: v.modelo_id ?? null,
      titulo: v.titulo.trim(),
      entidade_tipo: v.entidade_tipo,
      entidade_id: v.entidade_id,
      entidade_nome: v.entidade_nome ?? null,
      conteudo: v.conteudo ?? "",
      status: v.status ?? "rascunho",
      dt_emissao: v.dt_emissao || new Date().toISOString().slice(0, 10),
      dt_assinatura: v.dt_assinatura || null,
      dt_vencimento: v.dt_vencimento || null,
      anexo_url: v.anexo_url || null,
      observacoes: v.observacoes || null,
      exige_assinatura_digital: !!v.exige_assinatura_digital,
      token_publico: v.token_publico || null,
    };
    const novo = !v.id;
    const q = novo ? db.from("documentos").insert(stamp(payload, true)) : db.from("documentos").update(stamp(payload, false)).eq("id", v.id);
    const { error } = await q;
    setSalvando(false);
    if (error) return void toast.error("Não foi possível salvar", { description: error.message });
    toast.success("Documento salvo.");
    qc.invalidateQueries({ queryKey: ["documentos"] });
    onOpenChange(false);
  }

  const ro = !canEdit;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle>{v.id ? "Documento" : "Novo documento"}</DialogTitle>
          {v.entidade_nome && <p className="text-muted-foreground text-sm">{v.entidade_nome}</p>}
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Título</Label>
              <Input value={v.titulo ?? ""} disabled={ro} onChange={(e) => setV({ ...v, titulo: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Situação</Label>
              <Select value={v.status ?? "rascunho"} disabled={ro} onValueChange={(s) => setV({ ...v, status: s })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent sort={false}>
                  {STATUS_DOC.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Emissão</Label>
              <Input type="date" value={v.dt_emissao ?? ""} disabled={ro} onChange={(e) => setV({ ...v, dt_emissao: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Assinatura</Label>
              <Input type="date" value={v.dt_assinatura ?? ""} disabled={ro} onChange={(e) => setV({ ...v, dt_assinatura: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Vencimento</Label>
              <Input type="date" value={v.dt_vencimento ?? ""} disabled={ro} onChange={(e) => setV({ ...v, dt_vencimento: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Texto do documento</Label>
            <Textarea rows={16} className="font-serif text-sm" value={v.conteudo ?? ""} disabled={ro} onChange={(e) => setV({ ...v, conteudo: e.target.value })} />
          </div>
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Coletar assinatura eletrônica por link</Label>
                <p className="text-muted-foreground text-xs">Desligado: imprima, assine no papel e anexe a via assinada.</p>
              </div>
              <Switch
                checked={!!v.exige_assinatura_digital}
                disabled={ro || !!v.assinado_em}
                onCheckedChange={(c) => setV({ ...v, exige_assinatura_digital: c, token_publico: c ? v.token_publico || novoTokenDoc() : v.token_publico ?? null })}
              />
            </div>
            {v.exige_assinatura_digital && v.token_publico && !v.assinado_em && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => {
                  void navigator.clipboard.writeText(linkAssinaturaDoc(window.location.origin, v.token_publico!));
                  toast.success("Link copiado. Salve o documento antes de enviar.");
                }}><Link2 className="size-4" /> Copiar link</Button>
                <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => {
                  const txt = `Olá! Segue o documento "${v.titulo ?? ""}" para assinatura eletrônica: ${linkAssinaturaDoc(window.location.origin, v.token_publico!)}`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, "_blank");
                }}><Send className="size-4" /> Enviar por WhatsApp</Button>
              </div>
            )}
            {v.assinado_em && (
              <pre className="bg-success/10 text-foreground whitespace-pre-wrap rounded p-2 text-xs">{carimboAssinatura(v as Row)}</pre>
            )}
          </div>
          {!v.exige_assinatura_digital && (
          <div className="space-y-1.5">
            <Label>Via assinada</Label>
            <div className="flex flex-wrap items-center gap-2">
              {v.anexo_url && (
                <a href={v.anexo_url} target="_blank" rel="noreferrer" className="text-primary flex items-center gap-1 text-sm underline">
                  <Paperclip className="size-4" /> Abrir anexo
                </a>
              )}
              {!ro && (
                <Input type="file" accept="application/pdf,image/*" className="max-w-xs" disabled={enviando}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void anexar(f); e.target.value = ""; }} />
              )}
              {enviando && <span className="text-muted-foreground text-xs">Enviando…</span>}
            </div>
          </div>
          )}
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={2} value={v.observacoes ?? ""} disabled={ro} onChange={(e) => setV({ ...v, observacoes: e.target.value })} />
          </div>
        </div>
        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button variant="ghost" className="mr-auto gap-1" onClick={() => imprimirDocumento(v.titulo ?? "", [v.conteudo ?? "", carimboAssinatura(v as Row)].filter(Boolean).join("\n\n"))}>
            <Printer className="size-4" /> Imprimir / PDF
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {!ro && <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PainelProps = {
  entidadeTipo: EntidadeDoc;
  entidadeId: string;
  entidadeNome: string;
  registro: Row | null;
};

/** Lista e emissão de documentos de um cadastro (usuário, cliente, empresa, veículo). */
export function DocumentosPainel({ entidadeTipo, entidadeId, entidadeNome, registro }: PainelProps) {
  const qc = useQueryClient();
  const { empresa } = useAuth();
  const { data: modelos = [] } = useModelos();
  const [modeloId, setModeloId] = useState("");
  const [edit, setEdit] = useState<Partial<DocumentoRow> | null>(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["documentos", entidadeTipo, entidadeId],
    enabled: !!entidadeId,
    queryFn: async () => {
      const { data, error } = await db.from("documentos").select("*")
        .eq("entidade_tipo", entidadeTipo).eq("entidade_id", entidadeId).order("dt_emissao", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocumentoRow[];
    },
  });

  const opcoes = useMemo(
    () => modelos.filter((m) => m["status"] !== false && m["entidade_tipo"] === entidadeTipo)
      .map((m) => ({ value: String(m["id"]), label: String(m["titulo"]) })),
    [modelos, entidadeTipo],
  );

  function emitir() {
    const m = modelos.find((x) => String(x["id"]) === modeloId);
    if (!m) return;
    const vars = variaveisDe(entidadeTipo, registro, empresa);
    const dias = Number(m["validade_dias"] ?? 0);
    const venc = dias > 0 ? new Date(Date.now() + dias * 864e5).toISOString().slice(0, 10) : null;
    setEdit({
      modelo_id: String(m["id"]),
      titulo: String(m["titulo"]),
      entidade_tipo: entidadeTipo,
      entidade_id: entidadeId,
      entidade_nome: entidadeNome,
      conteudo: renderModelo(String(m["conteudo"] ?? ""), vars),
      status: "emitido",
      dt_emissao: new Date().toISOString().slice(0, 10),
      dt_vencimento: venc,
    });
  }

  async function excluir(d: DocumentoRow) {
    if (!confirm(`Excluir "${d.titulo}"?`)) return;
    const { error } = await db.from("documentos").delete().eq("id", d.id);
    if (error) return void toast.error("Não foi possível excluir", { description: error.message });
    qc.invalidateQueries({ queryKey: ["documentos"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-60 flex-1 space-y-1.5">
          <Label>Emitir a partir de um modelo</Label>
          <SearchSelect value={modeloId} onChange={setModeloId} options={opcoes} placeholder={opcoes.length ? "Escolha o modelo" : "Nenhum modelo para este cadastro"} />
        </div>
        <Button onClick={emitir} disabled={!modeloId} className="gap-1"><FilePlus2 className="size-4" /> Emitir</Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : !docs.length ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">Nenhum documento ainda.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText className="text-muted-foreground size-4 shrink-0" />
              <button type="button" className="min-w-0 flex-1 text-left hover:underline" onClick={() => setEdit(d)}>
                <div className="truncate font-medium">{d.titulo}</div>
                <div className="text-muted-foreground text-xs">
                  Emitido em {formatDate(d.dt_emissao)}
                  {d.dt_vencimento ? <> · vence <VencimentoInfo data={d.dt_vencimento} /></> : null}
                </div>
              </button>
              {d.exige_assinatura_digital && <ShieldCheck className={cn("size-4", d.assinado_em ? "text-success" : "text-muted-foreground")} aria-label="Assinatura eletrônica" />}
              {d.anexo_url && <Paperclip className="text-success size-4" aria-label="Via assinada anexada" />}
              <StatusDocBadge status={d.status} />
              <Button size="icon" variant="ghost" onClick={() => excluir(d)} aria-label="Excluir"><Trash2 className="size-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      <DocumentoEditor open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} doc={edit} canEdit />
    </div>
  );
}

/** Botão "Documentos" para cabeçalhos de formulário. */
export function DocumentosButton(props: PainelProps) {
  const [open, setOpen] = useState(false);
  if (!props.entidadeId) return null;
  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => setOpen(true)}>
        <FileText className="size-4" /> Documentos
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Documentos — {props.entidadeNome}</DialogTitle>
          </DialogHeader>
          <DocumentosPainel {...props} />
        </DialogContent>
      </Dialog>
    </>
  );
}
