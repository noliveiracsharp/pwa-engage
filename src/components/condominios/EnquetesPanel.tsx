import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, FileText, ImagePlus, Paperclip, CheckCircle2, Copy, Lock, Pencil, Plus, Send, Square, Trash2, Users, Vote, X } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip } from "recharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { GENEROS } from "@/lib/cond-pessoa";
import {
  agregarEscala, agregarOpcoes, errosPublicacao, FAIXAS_ETARIAS, novoId, PAPEIS_VOTANTES, STATUS_ENQUETE, statusEfetivo, TIPOS_PERGUNTA, validarRespostas,
  type Pergunta, type Publico, type Resposta, type StatusEnquete, type TipoPergunta,
} from "@/lib/enquetes";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { comprimirImagem } from "@/lib/image-compress";
import { AcaoIcone } from "./AcaoIcone";
import { CampoData } from "./CampoData";
import { s, useCondRows } from "./cond-data";

type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const CORES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--primary)", "var(--muted-foreground)"];
const COR_STATUS: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground", ativa: "bg-success/15 text-success", agendada: "bg-primary/15 text-primary",
  encerrada: "bg-secondary text-secondary-foreground", cancelada: "bg-destructive/15 text-destructive",
};
const rotuloStatus = (v: string) => (v === "agendada" ? "Agendada" : STATUS_ENQUETE.find((x) => x.value === v)?.label ?? v);
const dataBr = (iso: unknown) => (iso ? new Date(String(iso)).toLocaleDateString("pt-BR") : "");
const statusDe = (e: Row) => {
  const st = statusEfetivo(s(e["status"]) as StatusEnquete, s(e["fim_em"]) || null);
  return st === "ativa" && e["inicio_em"] && new Date(s(e["inicio_em"])) > new Date() ? "agendada" : st;
};
const normPerguntas = (rows: Row[]): Pergunta[] =>
  [...rows].sort((a, b) => Number(a["ordem"]) - Number(b["ordem"])).map((q) => ({
    id: s(q["id"]), ordem: Number(q["ordem"]), texto: s(q["texto"]), tipo: s(q["tipo"]) as TipoPergunta,
    obrigatoria: q["obrigatoria"] !== false, opcoes: Array.isArray(q["opcoes"]) ? (q["opcoes"] as Pergunta["opcoes"]) : [],
  }));

/** Enquetes & Pesquisas: gestão (síndico/administradora por perfil) e votação dos moradores. */
export function EnquetesPanel({ condominioId, blocos, perms }: { condominioId: string; blocos: Row[]; perms: Perms }) {
  const gestor = perms.canCreate || perms.canUpdate;
  return (
    <Tabs defaultValue={gestor ? "gestao" : "responder"} className="space-y-3">
      {gestor && (
        <TabsList>
          <TabsTrigger value="gestao">Gestão</TabsTrigger>
          <TabsTrigger value="responder">Para responder</TabsTrigger>
        </TabsList>
      )}
      {gestor && <TabsContent value="gestao"><Gestao condominioId={condominioId} blocos={blocos} perms={perms} /></TabsContent>}
      <TabsContent value="responder"><Responder condominioId={condominioId} /></TabsContent>
    </Tabs>
  );
}

/* ------------------------------- Gestão ------------------------------- */

function Gestao({ condominioId, blocos, perms }: { condominioId: string; blocos: Row[]; perms: Perms }) {
  const qc = useQueryClient();
  const { data: enquetes = [] } = useCondRows("cond_enquetes", "condominio_id", condominioId);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<string>("");
  const [editar, setEditar] = useState<Row | "nova" | null>(null);
  const [resultado, setResultado] = useState<Row | null>(null);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["cond", "cond_enquetes"] });
  const termo = busca.trim().toLowerCase();
  const lista = [...enquetes]
    .sort((a, b) => s(b["created_at"]).localeCompare(s(a["created_at"])))
    .filter((e) => (!termo || s(e["titulo"]).toLowerCase().includes(termo)) && (!filtro || statusDe(e) === filtro));
  const contagem = (st: string) => enquetes.filter((e) => statusDe(e) === st).length;

  async function mudarStatus(e: Row, status: StatusEnquete) {
    if (status === "ativa") {
      const { data: qs } = await db.from("cond_enquetes_perguntas").select("*").eq("enquete_id", e["id"]);
      const erros = errosPublicacao(s(e["titulo"]), normPerguntas(qs ?? []));
      if (erros.length) { toast.error(erros[0]); return; }
      if (!(await confirmar({ title: "Publicar enquete?", description: "Os moradores do público escolhido já poderão responder. Depois de publicada, as perguntas não podem mais ser alteradas.", confirmText: "Publicar" }))) return;
    }
    if (status === "encerrada" && !(await confirmar({ title: "Encerrar enquete?", description: "Ninguém mais poderá votar e o resultado fica final.", confirmText: "Encerrar" }))) return;
    if (status === "cancelada" && !(await confirmar({ title: "Cancelar enquete?", description: "Ela sai da lista dos moradores. Os votos já registrados continuam guardados.", confirmText: "Cancelar enquete", destructive: true }))) return;
    const extra = status === "ativa" && !e["inicio_em"] ? { inicio_em: new Date().toISOString() } : status === "encerrada" && s(e["status"]) === "ativa" && (!e["fim_em"] || new Date(s(e["fim_em"])) > new Date()) ? { fim_em: new Date().toISOString() } : {};
    const { error } = await db.from("cond_enquetes").update({ status, ...extra, updated_at: new Date().toISOString() }).eq("id", e["id"]);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "ativa" ? "Enquete publicada." : status === "encerrada" ? "Enquete encerrada." : "Enquete cancelada.");
    void recarregar();
  }
  async function excluir(e: Row) {
    if (!(await confirmar({ title: "Excluir enquete?", description: "As perguntas e os votos serão apagados definitivamente.", confirmText: "Excluir", destructive: true }))) return;
    const { error } = await db.from("cond_enquetes").delete().eq("id", e["id"]);
    if (error) { toast.error(error.message); return; }
    toast.success("Enquete excluída."); void recarregar();
  }
  async function duplicar(e: Row) {
    const { data: qs } = await db.from("cond_enquetes_perguntas").select("*").eq("enquete_id", e["id"]);
    const { data: nova, error } = await db.from("cond_enquetes").insert({
      condominio_id: condominioId, titulo: `${s(e["titulo"])} (cópia)`, descricao: e["descricao"], status: "rascunho",
      voto_secreto: e["voto_secreto"], voto_por: e["voto_por"], mostrar_resultado: e["mostrar_resultado"], publico: e["publico"],
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    if (qs?.length) await db.from("cond_enquetes_perguntas").insert(qs.map((q: Row) => ({ enquete_id: nova.id, ordem: q["ordem"], texto: q["texto"], tipo: q["tipo"], obrigatoria: q["obrigatoria"], opcoes: q["opcoes"] })));
    toast.success("Cópia criada como rascunho."); void recarregar();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Pesquisar enquete…" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-sm" />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por situação">
          {(["rascunho", "agendada", "ativa", "encerrada", "cancelada"] as const).map((st) => (
            <button key={st} type="button" aria-pressed={filtro === st} onClick={() => setFiltro(filtro === st ? "" : st)}
              className={cn("rounded-full border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", filtro === st && "ring-2 ring-primary/40", COR_STATUS[st])}>
              {rotuloStatus(st)} <span className="tabular-nums opacity-80">{contagem(st)}</span>
            </button>
          ))}
        </div>
        {perms.canCreate && <Button className="ml-auto" onClick={() => setEditar("nova")}><Plus className="mr-1 size-4" /> Nova enquete</Button>}
      </div>

      {lista.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          <Vote className="mx-auto mb-2 size-8 opacity-60" />
          {enquetes.length ? "Nenhuma enquete encontrada." : "Nenhuma enquete ainda. Crie uma pergunta rápida ou uma pesquisa completa."}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {lista.map((e) => {
            const st = statusDe(e);
            const pub = (e["publico"] ?? {}) as Publico;
            return (
              <div key={s(e["id"])} className="flex flex-col gap-2 rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{s(e["titulo"])}</p>
                    <p className="text-xs text-muted-foreground">{resumoPublico(pub, blocos)}</p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", COR_STATUS[st])}>{rotuloStatus(st)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <Badge variant="outline">{e["voto_secreto"] ? <><Lock className="mr-1 size-3" />Voto secreto</> : "Voto aberto"}</Badge>
                  <Badge variant="outline">{s(e["voto_por"]) === "unidade" ? "1 voto por unidade" : "1 voto por pessoa"}</Badge>
                  {e["fim_em"] ? <Badge variant="outline">Até {dataBr(e["fim_em"])}</Badge> : null}
                </div>
                <div className="mt-auto flex flex-wrap items-center justify-end gap-0.5 border-t pt-2">
                  {st === "rascunho" && perms.canUpdate && <AcaoIcone titulo="Editar" onClick={() => setEditar(e)}><Pencil className="size-4" /></AcaoIcone>}
                  {st === "rascunho" && perms.canUpdate && <AcaoIcone titulo="Publicar" destaque onClick={() => void mudarStatus(e, "ativa")}><Send className="size-4" /></AcaoIcone>}
                  {(st === "ativa" || st === "agendada") && perms.canUpdate && <AcaoIcone titulo="Encerrar agora" onClick={() => void mudarStatus(e, "encerrada")}><Square className="size-4" /></AcaoIcone>}
                  {st !== "rascunho" && <AcaoIcone titulo="Ver resultado" destaque={st !== "cancelada"} onClick={() => setResultado(e)}><BarChart3 className="size-4" /></AcaoIcone>}
                  {perms.canCreate && <AcaoIcone titulo="Duplicar" onClick={() => void duplicar(e)}><Copy className="size-4" /></AcaoIcone>}
                  {(st === "ativa" || st === "agendada") && perms.canUpdate && <AcaoIcone titulo="Cancelar enquete" destrutivo onClick={() => void mudarStatus(e, "cancelada")}><X className="size-4" /></AcaoIcone>}
                  {perms.canDelete && <AcaoIcone titulo="Excluir" destrutivo onClick={() => void excluir(e)}><Trash2 className="size-4" /></AcaoIcone>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {editar && <EnqueteEditor condominioId={condominioId} blocos={blocos} enquete={editar === "nova" ? null : editar} onClose={() => setEditar(null)} onSalvo={() => void recarregar()} />}
      {resultado && <ResultadoDialog enquete={resultado} gestor onClose={() => setResultado(null)} />}
    </div>
  );
}

function resumoPublico(p: Publico, blocos: Row[]) {
  const partes: string[] = [];
  if (p.blocos?.length) partes.push(p.blocos.map((id) => s(blocos.find((b) => s(b["id"]) === id)?.["nome"]) || "?").join(", "));
  if (p.papeis?.length) partes.push(p.papeis.map((x) => PAPEIS_VOTANTES.find((y) => y.value === x)?.label ?? x).join(", "));
  if (p.generos?.length) partes.push(p.generos.map((x) => GENEROS.find((y) => y.value === x)?.label ?? x).join(", "));
  const f = FAIXAS_ETARIAS.find((x) => x.min === (p.idade_min ?? null) && x.max === (p.idade_max ?? null));
  if (f && f.value !== "todas") partes.push(f.label);
  else if (!f) partes.push(`${p.idade_min ?? 0} a ${p.idade_max ?? "∞"} anos`);
  if (p.apenas_residentes) partes.push("só quem mora");
  return partes.length ? `Público: ${partes.join(" · ")}` : "Público: todos os moradores";
}

/* ------------------------------- Anexos ------------------------------- */

async function enviarAnexo(original: File): Promise<string | null> {
  const img = original.type.startsWith("image/");
  const file = img ? await comprimirImagem(original, "chat") : original;
  const ext = (original.name.split(".").pop() || "bin").toLowerCase();
  const path = `enquetes/${novoId()}.${ext}`;
  const up = await supabase.storage.from("chat_media").upload(path, file, file.type ? { contentType: file.type } : undefined);
  if (up.error) { toast.error(`Falha no envio: ${up.error.message}`); return null; }
  return supabase.storage.from("chat_media").getPublicUrl(path).data.publicUrl;
}

function BotaoAnexo({ tipo, onArquivo }: { tipo: "imagem" | "arquivo"; onArquivo: (url: string, nome: string) => void }) {
  const [enviando, setEnviando] = useState(false);
  return (
    <label title={tipo === "imagem" ? "Adicionar foto (otimizada automaticamente antes do envio)" : "Anexar arquivo (PDF, orçamento…)"}
      className={cn("inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-within:ring-2 focus-within:ring-ring", enviando && "opacity-50")}>
      <span className="sr-only">{tipo === "imagem" ? "Adicionar foto" : "Anexar arquivo"}</span>
      {tipo === "imagem" ? <ImagePlus className="size-4" /> : <Paperclip className="size-4" />}
      <input type="file" className="sr-only" disabled={enviando} accept={tipo === "imagem" ? "image/*" : ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,image/*"}
        onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setEnviando(true); const url = await enviarAnexo(f); setEnviando(false); if (url) onArquivo(url, f.name); }} />
    </label>
  );
}

/** Foto e/ou arquivo da opção (editor, votação e resultado). */
function AnexosOpcao({ o, onRemover, grande }: { o: { imagem?: string | null; arquivo?: string | null; arquivo_nome?: string | null; texto: string }; onRemover?: (c: "imagem" | "arquivo") => void; grande?: boolean }) {
  const [zoom, setZoom] = useState(false);
  if (!o.imagem && !o.arquivo) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {o.imagem && (
        <span className="relative">
          <button type="button" onClick={(e) => { e.stopPropagation(); setZoom(true); }} aria-label={`Ampliar foto de ${o.texto}`}
            className="block overflow-hidden rounded-md border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <img src={o.imagem} alt={o.texto} className={cn("object-cover", grande ? "h-28 w-40" : "h-12 w-16")} loading="lazy" />
          </button>
          {onRemover && <button type="button" aria-label="Remover foto" onClick={() => onRemover("imagem")} className="absolute -right-1.5 -top-1.5 rounded-full border bg-background p-0.5"><X className="size-3" /></button>}
        </span>
      )}
      {o.arquivo && (
        <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs">
          <a href={o.arquivo} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-primary hover:underline">
            <FileText className="size-3.5" />{o.arquivo_nome || "Ver anexo"}
          </a>
          {onRemover && <button type="button" aria-label="Remover arquivo" onClick={() => onRemover("arquivo")}><X className="size-3" /></button>}
        </span>
      )}
      {zoom && o.imagem && (
        <Dialog open onOpenChange={setZoom}>
          <DialogContent className="max-h-[92dvh] overflow-y-auto max-w-3xl p-2">
            <DialogHeader className="sr-only"><DialogTitle>{o.texto}</DialogTitle><DialogDescription>Foto da opção</DialogDescription></DialogHeader>
            <img src={o.imagem} alt={o.texto} className="max-h-[80vh] w-full rounded object-contain" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/* ------------------------------- Editor ------------------------------- */

function Chips<T extends string>({ opcoes, valor, onChange, rotulo }: { opcoes: { value: T; label: string }[]; valor: T[]; onChange: (v: T[]) => void; rotulo: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={rotulo}>
      {[...opcoes].sort((a, b) => a.label.localeCompare(b.label, "pt-BR")).map((o) => {
        const on = valor.includes(o.value);
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(on ? valor.filter((x) => x !== o.value) : [...valor, o.value])}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>
            {o.label}
          </button>
        );
      })}
      {!valor.length && <span className="self-center text-xs text-muted-foreground">Nenhum marcado = todos</span>}
    </div>
  );
}

function EnqueteEditor({ condominioId, blocos, enquete, onClose, onSalvo }: { condominioId: string; blocos: Row[]; enquete: Row | null; onClose: () => void; onSalvo: () => void }) {
  const { data: qsSalvas, isFetched } = useQuery({
    queryKey: ["cond", "cond_enquetes_perguntas", s(enquete?.["id"])],
    enabled: !!enquete,
    queryFn: async () => normPerguntas(((await db.from("cond_enquetes_perguntas").select("*").eq("enquete_id", enquete!["id"])).data ?? []) as Row[]),
  });
  const pub0 = (enquete?.["publico"] ?? {}) as Publico;
  const [titulo, setTitulo] = useState(s(enquete?.["titulo"]));
  const [descricao, setDescricao] = useState(s(enquete?.["descricao"]));
  const [fim, setFim] = useState(s(enquete?.["fim_em"]).slice(0, 10));
  const [inicio, setInicio] = useState(s(enquete?.["inicio_em"]).slice(0, 10));
  const [secreto, setSecreto] = useState(enquete?.["voto_secreto"] === true);
  const [porUnidade, setPorUnidade] = useState(s(enquete?.["voto_por"]) === "unidade");
  const [mostrar, setMostrar] = useState(s(enquete?.["mostrar_resultado"]) || "apos_votar");
  const [pub, setPub] = useState<Publico>({ blocos: pub0.blocos ?? [], papeis: pub0.papeis ?? [], generos: pub0.generos ?? [], idade_min: pub0.idade_min ?? null, idade_max: pub0.idade_max ?? null, apenas_residentes: pub0.apenas_residentes ?? false });
  const [perguntas, setPerguntas] = useState<Pergunta[] | null>(enquete ? null : [novaPergunta(0)]);
  const [salvando, setSalvando] = useState(false);
  if (perguntas === null && isFetched) setPerguntas(qsSalvas?.length ? qsSalvas : [novaPergunta(0)]);
  const faixa = FAIXAS_ETARIAS.find((x) => x.min === (pub.idade_min ?? null) && x.max === (pub.idade_max ?? null))?.value ?? "personalizada";

  const setQ = (i: number, q: Partial<Pergunta>) => setPerguntas((ps) => ps!.map((x, k) => (k === i ? { ...x, ...q } : x)));

  async function salvar(publicar: boolean) {
    const qs = (perguntas ?? []).map((q, i) => ({ ...q, ordem: i, opcoes: q.tipo === "unica" || q.tipo === "multipla" ? q.opcoes.filter((o) => o.texto.trim()) : [] }));
    if (!titulo.trim()) { toast.error("Informe o título."); return; }
    if (publicar) { const e = errosPublicacao(titulo, qs); if (e.length) { toast.error(e[0]); return; } }
    if (fim && inicio && fim < inicio) { toast.error("A data final deve ser depois do início."); return; }
    setSalvando(true);
    try {
      const valores = {
        condominio_id: condominioId, titulo: titulo.trim(), descricao: descricao.trim() || null,
        inicio_em: inicio ? new Date(`${inicio}T00:00:00`).toISOString() : publicar ? new Date().toISOString() : null,
        fim_em: fim ? new Date(`${fim}T23:59:59`).toISOString() : null,
        voto_secreto: secreto, voto_por: porUnidade ? "unidade" : "pessoa", mostrar_resultado: mostrar, publico: pub,
        status: publicar ? "ativa" : "rascunho", updated_at: new Date().toISOString(),
      };
      let id = s(enquete?.["id"]);
      if (id) { const r = await db.from("cond_enquetes").update(valores).eq("id", id); if (r.error) throw r.error; }
      else { const r = await db.from("cond_enquetes").insert(valores).select("id").single(); if (r.error) throw r.error; id = r.data.id; }
      const del = await db.from("cond_enquetes_perguntas").delete().eq("enquete_id", id);
      if (del.error) throw del.error;
      if (qs.length) {
        const ins = await db.from("cond_enquetes_perguntas").insert(qs.map((q) => ({ enquete_id: id, ordem: q.ordem, texto: q.texto.trim(), tipo: q.tipo, obrigatoria: q.obrigatoria, opcoes: q.opcoes })));
        if (ins.error) throw ins.error;
      }
      toast.success(publicar ? "Enquete publicada." : "Rascunho salvo.");
      onSalvo(); onClose();
    } catch (e) {
      toast.error(`Não foi possível salvar: ${(e as Error).message}`);
    } finally { setSalvando(false); }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-none lg:w-[60vw]" onInteractOutside={(e) => e.preventDefault()}>
        <SheetHeader className="border-b p-4"><SheetTitle>{enquete ? "Editar enquete" : "Nova enquete"}</SheetTitle></SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <section className="space-y-3">
            <div><Label htmlFor="enq-tit" className="mb-1.5 block">Título</Label><Input id="enq-tit" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Reforma do salão de festas" /></div>
            <div><Label htmlFor="enq-desc" className="mb-1.5 block">Explicação para o morador (opcional)</Label><Textarea id="enq-desc" rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="enq-ini" className="mb-1.5 block">Começa em (vazio = ao publicar)</Label><CampoData id="enq-ini" inicio={2024} value={inicio} onChange={setInicio} /></div>
              <div><Label htmlFor="enq-fim" className="mb-1.5 block">Encerra em (vazio = manual)</Label><CampoData id="enq-fim" inicio={2024} value={fim} onChange={setFim} /></div>
            </div>
          </section>

          <section className="space-y-3 rounded-lg border p-3">
            <h3 className="text-sm font-semibold">Como funciona o voto</h3>
            <label className="flex flex-wrap items-center justify-between gap-3 text-sm"><span><strong>Voto secreto</strong><br /><span className="text-xs text-muted-foreground">Ninguém, nem a gestão, vê em quem cada pessoa votou.</span></span><Switch checked={secreto} onCheckedChange={setSecreto} /></label>
            <label className="flex flex-wrap items-center justify-between gap-3 text-sm"><span><strong>Um voto por unidade</strong><br /><span className="text-xs text-muted-foreground">Desligado: cada pessoa do público vota.</span></span><Switch checked={porUnidade} onCheckedChange={setPorUnidade} /></label>
            <div><Label className="mb-1.5 block">O morador vê o resultado</Label>
              <SearchSelect value={mostrar} onChange={(v) => setMostrar(v || "apos_votar")} options={[
                { value: "apos_encerrar", label: "Só depois de encerrada" },
                { value: "apos_votar", label: "Logo depois de votar" },
                { value: "nunca", label: "Nunca (só a gestão)" },
              ]} />
            </div>
          </section>

          <section className="space-y-3 rounded-lg border p-3">
            <h3 className="text-sm font-semibold">Quem pode responder</h3>
            {blocos.length > 1 && <div><Label className="mb-1.5 block">Torres / blocos</Label>
              <Chips rotulo="Torres" opcoes={blocos.map((b) => ({ value: s(b["id"]), label: s(b["nome"]) }))} valor={pub.blocos ?? []} onChange={(v) => setPub({ ...pub, blocos: v })} /></div>}
            <div><Label className="mb-1.5 block">Vínculo com a unidade</Label>
              <Chips rotulo="Vínculo" opcoes={PAPEIS_VOTANTES} valor={pub.papeis ?? []} onChange={(v) => setPub({ ...pub, papeis: v })} /></div>
            <div><Label className="mb-1.5 block">Gênero</Label>
              <Chips rotulo="Gênero" opcoes={GENEROS} valor={pub.generos ?? []} onChange={(v) => setPub({ ...pub, generos: v })} /></div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-1"><Label className="mb-1.5 block">Faixa etária</Label>
                <SearchSelect value={faixa} onChange={(v) => { const f = FAIXAS_ETARIAS.find((x) => x.value === v); if (f) setPub({ ...pub, idade_min: f.min, idade_max: f.max }); }}
                  options={[...FAIXAS_ETARIAS.map((f) => ({ value: f.value, label: f.label })), ...(faixa === "personalizada" ? [{ value: "personalizada", label: "Personalizada" }] : [])]} /></div>
              <div><Label htmlFor="enq-imin" className="mb-1.5 block">Idade mínima</Label><Input id="enq-imin" type="number" min={0} value={pub.idade_min ?? ""} onChange={(e) => setPub({ ...pub, idade_min: e.target.value === "" ? null : Number(e.target.value) })} /></div>
              <div><Label htmlFor="enq-imax" className="mb-1.5 block">Idade máxima</Label><Input id="enq-imax" type="number" min={0} value={pub.idade_max ?? ""} onChange={(e) => setPub({ ...pub, idade_max: e.target.value === "" ? null : Number(e.target.value) })} /></div>
            </div>
            {(pub.idade_min != null || pub.idade_max != null) && <p className="text-xs text-muted-foreground">Pessoas sem data de nascimento no cadastro ficam fora quando há filtro de idade.</p>}
            <label className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>Somente quem mora na unidade</span><Switch checked={pub.apenas_residentes === true} onCheckedChange={(v) => setPub({ ...pub, apenas_residentes: v })} /></label>
            <p className="text-xs text-muted-foreground">Prestadores, colaboradores e visitantes nunca votam.</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Perguntas {perguntas && perguntas.length > 1 ? `(${perguntas.length} — pesquisa)` : "(1 — enquete rápida)"}</h3>
            {(perguntas ?? []).map((q, i) => (
              <div key={q.id} className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">{i + 1}.</span>
                  <Input aria-label={`Enunciado da pergunta ${i + 1}`} value={q.texto} onChange={(e) => setQ(i, { texto: e.target.value })} placeholder="Escreva a pergunta" />
                  {perguntas!.length > 1 && <AcaoIcone titulo="Remover pergunta" destrutivo onClick={() => setPerguntas(perguntas!.filter((_, k) => k !== i))}><Trash2 className="size-4" /></AcaoIcone>}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-64"><SearchSelect value={q.tipo} onChange={(v) => v && setQ(i, { tipo: v as TipoPergunta, opcoes: (v === "unica" || v === "multipla") && q.opcoes.length < 2 ? [{ id: novoId(), texto: "" }, { id: novoId(), texto: "" }] : q.opcoes })} options={TIPOS_PERGUNTA} /></div>
                  <label className="flex items-center gap-2 text-sm"><Switch checked={q.obrigatoria} onCheckedChange={(v) => setQ(i, { obrigatoria: v })} /> Obrigatória</label>
                </div>
                {(q.tipo === "unica" || q.tipo === "multipla") && (
                  <div className="space-y-1.5 pl-4">
                    {q.opcoes.map((o, k) => (
                      <div key={o.id} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={cn("size-3 shrink-0 border", q.tipo === "unica" ? "rounded-full" : "rounded-sm")} style={{ background: CORES[k % CORES.length] }} />
                        <Input aria-label={`Opção ${k + 1}`} className="h-8" value={o.texto} onChange={(e) => setQ(i, { opcoes: q.opcoes.map((x) => (x.id === o.id ? { ...x, texto: e.target.value } : x)) })} placeholder={`Opção ${k + 1}`} />
                        <BotaoAnexo tipo="imagem" onArquivo={(url) => setQ(i, { opcoes: q.opcoes.map((x) => (x.id === o.id ? { ...x, imagem: url } : x)) })} />
                        <BotaoAnexo tipo="arquivo" onArquivo={(url, nome) => setQ(i, { opcoes: q.opcoes.map((x) => (x.id === o.id ? { ...x, arquivo: url, arquivo_nome: nome } : x)) })} />
                        {q.opcoes.length > 2 && <AcaoIcone titulo="Remover opção" onClick={() => setQ(i, { opcoes: q.opcoes.filter((x) => x.id !== o.id) })}><X className="size-4" /></AcaoIcone>}
                      </div>
                      <div className="pl-5"><AnexosOpcao o={o} onRemover={(c) => setQ(i, { opcoes: q.opcoes.map((x) => (x.id === o.id ? (c === "imagem" ? { ...x, imagem: null } : { ...x, arquivo: null, arquivo_nome: null }) : x)) })} /></div>
                      </div>
                    ))}
                    <Button type="button" size="sm" variant="ghost" onClick={() => setQ(i, { opcoes: [...q.opcoes, { id: novoId(), texto: "" }] })}><Plus className="mr-1 size-3" /> Opção</Button>
                  </div>
                )}
                {q.tipo === "escala" && <p className="pl-4 text-xs text-muted-foreground">O morador dará uma nota de 1 a 5.</p>}
                {q.tipo === "texto" && <p className="pl-4 text-xs text-muted-foreground">Resposta escrita; só a gestão lê.</p>}
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => setPerguntas([...(perguntas ?? []), novaPergunta((perguntas ?? []).length)])}><Plus className="mr-1 size-4" /> Adicionar pergunta</Button>
          </section>
        </div>
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-background p-4">
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button variant="secondary" onClick={() => void salvar(false)} disabled={salvando || perguntas === null}>Salvar rascunho</Button>
          <Button onClick={() => void salvar(true)} disabled={salvando || perguntas === null}><Send className="mr-1 size-4" /> Salvar e publicar</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
const novaPergunta = (ordem: number): Pergunta => ({ id: novoId(), ordem, texto: "", tipo: "unica", obrigatoria: true, opcoes: [{ id: novoId(), texto: "" }, { id: novoId(), texto: "" }] });

/* ------------------------------ Resultado ------------------------------ */

type VotoRes = { pergunta_id: string; opcoes: string[] | null; nota: number | null; texto: string | null; nome: string | null; unidade: string | null };

function ResultadoDialog({ enquete, perguntas: qsProp, gestor, onClose }: { enquete: Row; perguntas?: Pergunta[]; gestor?: boolean; onClose: () => void }) {
  const id = s(enquete["id"]);
  const { data: qsDb } = useQuery({
    queryKey: ["cond", "cond_enquetes_perguntas", id],
    enabled: !qsProp,
    queryFn: async () => normPerguntas(((await db.from("cond_enquetes_perguntas").select("*").eq("enquete_id", id)).data ?? []) as Row[]),
  });
  const perguntas = qsProp ?? qsDb ?? [];
  const { data: res, isLoading } = useQuery({
    queryKey: ["cond", "enquete_resultado", id],
    queryFn: async () => { const r = await db.rpc("cond_enquete_resultado", { p_enquete: id }); if (r.error) throw r.error; return r.data as { oculto?: boolean; participantes: number; votos: VotoRes[] } | null; },
  });
  const { data: totalPublico } = useQuery({
    queryKey: ["cond", "enquete_publico", id], enabled: !!gestor,
    queryFn: async () => { const r = await db.rpc("cond_enquete_publico_total", { p_enquete: id }); return (r.data ?? 0) as number; },
  });
  const secreto = enquete["voto_secreto"] === true;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{s(enquete["titulo"])}</DialogTitle>
          <DialogDescription>
            {res && !res.oculto ? <>{res.participantes} {res.participantes === 1 ? "participação" : "participações"}{gestor && totalPublico ? ` de ${totalPublico} pessoas no público (${Math.round((res.participantes / totalPublico) * 100)}%)` : ""}{secreto ? " · voto secreto" : ""}</> : " "}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          : !res ? <p className="py-6 text-center text-sm text-muted-foreground">Resultado indisponível.</p>
          : res.oculto ? <p className="py-6 text-center text-sm text-muted-foreground">O resultado será divulgado {s(enquete["mostrar_resultado"]) === "apos_encerrar" ? "quando a enquete for encerrada" : "pela gestão"}.</p>
          : (
            <div className="space-y-6">
              {perguntas.map((q, i) => <ResultadoPergunta key={q.id} n={i + 1} q={q} votos={res.votos.filter((v) => v.pergunta_id === q.id)} mostrarVotantes={!secreto} />)}
            </div>
          )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultadoPergunta({ n, q, votos, mostrarVotantes }: { n: number; q: Pergunta; votos: VotoRes[]; mostrarVotantes: boolean }) {
  const [verQuem, setVerQuem] = useState(false);
  const titulo = <h4 className="font-semibold">{n}. {q.texto}</h4>;
  if (q.tipo === "texto") {
    const textos = votos.filter((v) => v.texto);
    return <section className="space-y-2">{titulo}
      {textos.length ? <ul className="space-y-1.5">{textos.map((v, k) => <li key={k} className="rounded-md border bg-muted/30 p-2 text-sm">{v.texto}{mostrarVotantes && v.nome ? <span className="mt-1 block text-xs text-muted-foreground">{v.nome}{v.unidade ? ` · ${v.unidade}` : ""}</span> : null}</li>)}</ul>
        : <p className="text-sm text-muted-foreground">{votos.length ? "Respostas escritas só aparecem para a gestão." : "Sem respostas."}</p>}
    </section>;
  }
  if (q.tipo === "escala") {
    const r = agregarEscala(votos);
    const max = Math.max(1, ...r.dist);
    return <section className="space-y-2">{titulo}
      <p className="text-2xl font-bold tabular-nums">{r.media.toLocaleString("pt-BR")} <span className="text-sm font-normal text-muted-foreground">média · {r.respondentes} notas</span></p>
      <div className="space-y-1">{r.dist.map((c, k) => <div key={k} className="flex items-center gap-2 text-xs"><span className="w-10">{k + 1} ★</span><div className="h-3 flex-1 rounded bg-muted"><div className="h-3 rounded bg-primary" style={{ width: `${(c / max) * 100}%` }} /></div><span className="w-6 text-right tabular-nums">{c}</span></div>)}</div>
    </section>;
  }
  const { fatias, respondentes } = agregarOpcoes(q, votos);
  const comVoto = fatias.filter((f) => f.votos > 0);
  return (
    <section className="space-y-2">
      {titulo}
      <p className="text-xs text-muted-foreground">{respondentes} {respondentes === 1 ? "resposta" : "respostas"}{q.tipo === "multipla" ? " · várias opções por pessoa" : ""}</p>
      <div className="grid items-center gap-4 sm:grid-cols-[220px_1fr]">
        {q.tipo === "unica" ? (
          <div className="h-52" role="img" aria-label={`Gráfico de pizza: ${fatias.map((f) => `${f.texto} ${f.pct}%`).join(", ")}`}>
            {comVoto.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={fatias} dataKey="votos" nameKey="texto" innerRadius={45} outerRadius={85} paddingAngle={comVoto.length > 1 ? 2 : 0} stroke="var(--background)">
                    {fatias.map((f, k) => <Cell key={f.id} fill={CORES[k % CORES.length]} />)}
                  </Pie>
                  <RTooltip formatter={(v: number, nome: string) => [`${v} votos`, nome]} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="flex h-full items-center justify-center rounded-full border border-dashed text-xs text-muted-foreground">Sem votos</div>}
          </div>
        ) : <div className="hidden sm:block" />}
        <ul className="space-y-1.5">
          {fatias.map((f, k) => (
            <li key={f.id} className="space-y-0.5">
              <div className="flex items-center gap-2 text-sm"><span className="size-3 shrink-0 rounded-full" style={{ background: CORES[k % CORES.length] }} /><span className="flex-1">{f.texto}</span><span className="tabular-nums font-medium">{f.pct.toLocaleString("pt-BR")}%</span><span className="w-14 text-right text-xs tabular-nums text-muted-foreground">{f.votos} {f.votos === 1 ? "voto" : "votos"}</span></div>
              {q.tipo === "multipla" && <div className="h-2 rounded bg-muted"><div className="h-2 rounded" style={{ width: `${f.pct}%`, background: CORES[k % CORES.length] }} /></div>}
            </li>
          ))}
        </ul>
      </div>
      {mostrarVotantes && respondentes > 0 && (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setVerQuem(!verQuem)}><Users className="mr-1 size-4" /> {verQuem ? "Ocultar quem votou" : "Ver quem votou em cada opção"}</Button>
          {verQuem && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {fatias.map((f, k) => {
                const quem = votos.filter((v) => v.opcoes?.includes(f.id)).sort((a, b) => s(a.unidade).localeCompare(s(b.unidade), "pt-BR", { numeric: true }));
                return <div key={f.id} className="rounded-md border p-2">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold"><span className="size-2.5 rounded-full" style={{ background: CORES[k % CORES.length] }} />{f.texto}</p>
                  {quem.length ? <ul className="space-y-0.5 text-xs">{quem.map((v, j) => <li key={j}>{v.nome ?? "—"}{v.unidade ? <span className="text-muted-foreground"> · {v.unidade}</span> : null}</li>)}</ul> : <p className="text-xs text-muted-foreground">Ninguém</p>}
                </div>;
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------ Morador ------------------------------ */

type Minha = { id: string; titulo: string; descricao: string | null; status: string; fim_em: string | null; voto_secreto: boolean; voto_por: string; mostrar_resultado: string; ja_respondeu: boolean; unidade_respondeu: boolean; perguntas: Pergunta[] };

function Responder({ condominioId }: { condominioId: string }) {
  const { data: lista = [], isLoading, error } = useQuery({
    queryKey: ["cond", "enquetes_minhas", condominioId],
    queryFn: async () => { const r = await db.rpc("cond_enquetes_minhas", { p_condominio: condominioId }); if (r.error) throw r.error; return (r.data ?? []) as Minha[]; },
  });
  const [votar, setVotar] = useState<Minha | null>(null);
  const [ver, setVer] = useState<Minha | null>(null);
  if (isLoading) return <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>;
  if (error) return <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Enquetes ainda não liberadas neste sistema. Peça à administradora para rodar o script de Enquetes.</div>;
  if (!lista.length) return <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground"><Vote className="mx-auto mb-2 size-8 opacity-60" />Nenhuma enquete para você no momento.</div>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {lista.map((e) => {
        const respondida = e.ja_respondeu || e.unidade_respondeu;
        const aberta = e.status === "ativa" && !respondida;
        return (
          <div key={e.id} className={cn("flex flex-col gap-2 rounded-lg border bg-card p-4", aberta && "border-primary/50")}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">{e.titulo}</p>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", COR_STATUS[e.status])}>{rotuloStatus(e.status)}</span>
            </div>
            {e.descricao && <p className="text-sm text-muted-foreground">{e.descricao}</p>}
            <p className="text-xs text-muted-foreground">
              {e.perguntas.length === 1 ? "1 pergunta" : `${e.perguntas.length} perguntas`}{e.fim_em ? ` · até ${dataBr(e.fim_em)}` : ""}{e.voto_secreto ? " · voto secreto" : ""}
            </p>
            {respondida && <p className="flex items-center gap-1 text-sm text-success"><CheckCircle2 className="size-4" />{e.ja_respondeu ? "Você já respondeu." : "Sua unidade já votou."}</p>}
            <div className="mt-auto flex justify-end gap-2 pt-1">
              {(respondida || e.status === "encerrada") && e.mostrar_resultado !== "nunca" && <Button size="sm" variant="outline" onClick={() => setVer(e)}><BarChart3 className="mr-1 size-4" /> Resultado</Button>}
              {aberta && <Button size="sm" onClick={() => setVotar(e)}><Vote className="mr-1 size-4" /> Responder</Button>}
            </div>
          </div>
        );
      })}
      {votar && <VotarDialog enquete={votar} onClose={() => setVotar(null)} onVotou={() => { const e = votar; setVotar(null); if (e.mostrar_resultado === "apos_votar") setVer(e); }} />}
      {ver && <ResultadoDialog enquete={ver as unknown as Row} perguntas={ver.perguntas} onClose={() => setVer(null)} />}
    </div>
  );
}

function VotarDialog({ enquete, onClose, onVotou }: { enquete: Minha; onClose: () => void; onVotou: () => void }) {
  const qc = useQueryClient();
  const [resp, setResp] = useState<Record<string, Resposta>>({});
  const [passo, setPasso] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const qs = enquete.perguntas;
  const unica = qs.length === 1;
  const lista = useMemo(() => Object.values(resp), [resp]);
  const set = (id: string, r: Partial<Resposta>) => setResp((x) => ({ ...x, [id]: { ...x[id], pergunta_id: id, ...r } }));

  async function enviar() {
    const erro = validarRespostas(qs, lista);
    if (erro) { toast.error(erro); return; }
    setEnviando(true);
    const r = await db.rpc("cond_enquete_votar", { p_enquete: enquete.id, p_respostas: lista });
    setEnviando(false);
    if (r.error) { toast.error(r.error.message); return; }
    toast.success("Obrigado! Sua resposta foi registrada.");
    void qc.invalidateQueries({ queryKey: ["cond", "enquetes_minhas"] });
    void qc.invalidateQueries({ queryKey: ["cond", "enquete_resultado", enquete.id] });
    onVotou();
  }

  const visiveis = unica ? qs : [qs[passo]!];
  const erroPasso = !unica ? validarRespostas([qs[passo]!], lista) : null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{enquete.titulo}</DialogTitle>
          <DialogDescription>{unica ? (enquete.voto_secreto ? "Voto secreto: ninguém verá sua escolha." : "Seu nome e unidade ficam visíveis para a gestão.") : `Pergunta ${passo + 1} de ${qs.length}`}</DialogDescription>
        </DialogHeader>
        {!unica && <div className="h-1.5 rounded bg-muted"><div className="h-1.5 rounded bg-primary transition-all" style={{ width: `${((passo + 1) / qs.length) * 100}%` }} /></div>}
        <div className="space-y-5">
          {visiveis.map((q) => {
            const r = resp[q.id];
            return (
              <fieldset key={q.id} className="space-y-2">
                <legend className="mb-2 font-medium">{q.texto}{q.obrigatoria ? <span className="text-destructive"> *</span> : <span className="text-xs text-muted-foreground"> (opcional)</span>}</legend>
                {q.tipo === "unica" && q.opcoes.map((o) => {
                  const on = r?.opcoes?.[0] === o.id;
                  return <div key={o.id} className="space-y-2"><button type="button" role="radio" aria-checked={on} onClick={() => set(q.id, { opcoes: [o.id] })}
                    className={cn("flex w-full items-center gap-3 rounded-md border p-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted")}>
                    <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border", on && "border-primary")}>{on && <span className="size-2 rounded-full bg-primary" />}</span>{o.texto}
                  </button>{(o.imagem || o.arquivo) && <div className="-mt-1 pl-10"><AnexosOpcao o={o} grande /></div>}</div>;
                })}
                {q.tipo === "multipla" && q.opcoes.map((o) => {
                  const on = !!r?.opcoes?.includes(o.id);
                  return <div key={o.id} className="space-y-2"><label className={cn("flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm", on ? "border-primary bg-primary/10" : "hover:bg-muted")}>
                    <Checkbox checked={on} onCheckedChange={(v) => set(q.id, { opcoes: v ? [...(r?.opcoes ?? []), o.id] : (r?.opcoes ?? []).filter((x) => x !== o.id) })} />{o.texto}
                  </label>{(o.imagem || o.arquivo) && <div className="-mt-1 pl-10"><AnexosOpcao o={o} grande /></div>}</div>;
                })}
                {q.tipo === "escala" && <div className="flex gap-2" role="radiogroup" aria-label="Nota de 1 a 5">{[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={r?.nota === n} onClick={() => set(q.id, { nota: n })}
                    className={cn("flex size-11 items-center justify-center rounded-md border text-lg font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", r?.nota != null && n <= r.nota ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{n}</button>
                ))}</div>}
                {q.tipo === "texto" && <Textarea rows={3} aria-label={q.texto} value={r?.texto ?? ""} onChange={(e) => set(q.id, { texto: e.target.value })} />}
              </fieldset>
            );
          })}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => (unica || passo === 0 ? onClose() : setPasso(passo - 1))} disabled={enviando}>{unica || passo === 0 ? "Cancelar" : "Voltar"}</Button>
          {!unica && passo < qs.length - 1
            ? <Button onClick={() => (erroPasso ? toast.error(erroPasso.replace(/\d+/, String(passo + 1))) : setPasso(passo + 1))}>Próxima</Button>
            : <Button onClick={() => void enviar()} disabled={enviando}>{enviando ? "Enviando…" : "Enviar resposta"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
