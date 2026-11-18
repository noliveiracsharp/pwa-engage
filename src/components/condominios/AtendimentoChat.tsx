import { abrirArquivo } from "@/components/layout/VisualizadorArquivo";
import { dispararPush } from "@/lib/push";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GitBranch, Loader2, Lock, Paperclip, Printer, Send, Star, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { TextoRico } from "@/components/ui/texto-rico";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { imprimirElemento } from "@/lib/propostas";
import { htmlParaTexto } from "@/lib/html-texto";
import { enviarWhatsappEmpresa } from "@/lib/manutencoes";
import { STATUS_ATEND, mensagemInteracao, numeroTicket, prazoSla, situacaoSla, statusAtend, type Horarios } from "@/lib/cond-atendimentos";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { CampoData } from "./CampoData";
import { s } from "./cond-data";
import { SlaBadge, StatusBadge } from "./AtendimentosPanel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const dh = (v: unknown) => (v ? new Date(String(v)).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const alfa = <T extends { label: string }>(l: T[]) => [...l].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
const MAX_MB = 10;
const ACEITOS = ".pdf,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.webm,.xls,.xlsx,.doc,.docx,.zip,.rar,.mp3,.m4a";

export type Anexo = { path: string; nome: string; tipo: string; tamanho: number };
export type CtxAtend = {
  condominioId: string; nomeCondominio: string; gestao: boolean; me: string;
  atendimentos: Row[]; assuntos: Row[]; horarios: Horarios; espacos: Row[]; mencionaveis: Row[]; moradores: Row[]; blocos: Row[]; unidades: Row[];
  nomePessoa: (id: unknown) => string; recarregar: () => void; abrir: (id: string) => void; novo: (base?: Partial<Row>) => void;
};

/** Remove scripts, iframes, handlers e javascript: do HTML vindo de qualquer usuário. */
export function htmlSeguro(html: string) {
  return html.replace(/<(script|style|iframe|object|embed|form)[\s\S]*?<\/\1>/gi, "").replace(/<(script|iframe|object|embed)[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

async function enviarAnexos(condominioId: string, files: File[]): Promise<Anexo[]> {
  const out: Anexo[] = [];
  for (const f of files) {
    const nome = f.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "_");
    const path = `atendimentos/${condominioId}/${crypto.randomUUID()}-${nome}`;
    const { error } = await supabase.storage.from("cond-documentos").upload(path, f, f.type ? { contentType: f.type } : undefined);
    if (error) throw new Error(`Falha ao enviar ${f.name}: ${error.message}`);
    out.push({ path, nome: f.name, tipo: f.type, tamanho: f.size });
  }
  return out;
}
async function imagemNoTexto(condominioId: string, f: File) {
  const [a] = await enviarAnexos(condominioId, [f]);
  const { data } = await supabase.storage.from("cond-documentos").createSignedUrl(a!.path, 60 * 60 * 24 * 365);
  return data?.signedUrl ?? "";
}
async function abrirAnexo(a: Anexo) {
  const { data, error } = await supabase.storage.from("cond-documentos").createSignedUrl(a.path, 300);
  if (error || !data) { toast.error("Não foi possível abrir o arquivo."); return; }
  abrirArquivo({ url: data.signedUrl, titulo: a.nome, nome: a.nome });
}

/** Avisa por WhatsApp o outro lado do diálogo (responsáveis do assunto ou o morador). */
export async function notificarInteracao(ctx: Pick<CtxAtend, "condominioId" | "nomeCondominio">, atend: Row, evento: string, trecho?: string) {
  try {
    const { data } = await db.rpc("cond_atend_destinatarios", { p_atend: atend["id"] });
    const dest = ((data ?? []) as Row[]).filter((d) => s(d["celular"]));
    const texto = mensagemInteracao({ condominio: ctx.nomeCondominio, numero: atend["numero"], titulo: s(atend["titulo"]), evento, ...(trecho ? { trecho } : {}) });
    let ok = 0;
    for (const d of dest) { const erro = await enviarWhatsappEmpresa(ctx.condominioId, s(d["celular"]), texto); if (!erro) ok++; }
    return ok;
  } catch { return 0; }
}

function SeletorArquivos({ files, setFiles }: { files: File[]; setFiles: (f: File[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const add = (l: FileList | null) => {
    const novos = [...(l ?? [])].filter((f) => { if (f.size > MAX_MB * 1024 * 1024) { toast.error(`${f.name} passa de ${MAX_MB} MB.`); return false; } return true; });
    setFiles([...files, ...novos].slice(0, 10));
  };
  return (
    <div className="space-y-1.5">
      <input ref={ref} type="file" multiple accept={ACEITOS} className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <Button type="button" variant="outline" size="sm" onClick={() => ref.current?.click()}><Paperclip className="size-4" /> Anexar arquivos</Button>
      <p className="text-xs text-muted-foreground">Fotos, vídeos, PDF, planilhas e documentos · até {MAX_MB} MB cada · máx. 10 arquivos.</p>
      {files.length > 0 && <ul className="flex flex-wrap gap-1">{files.map((f, i) => (
        <li key={i} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">{f.name}<button type="button" aria-label={`Remover ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X className="size-3" /></button></li>
      ))}</ul>}
    </div>
  );
}

function ListaAnexos({ anexos }: { anexos: unknown }) {
  const l = (Array.isArray(anexos) ? anexos : []) as Anexo[];
  if (!l.length) return null;
  return <ul className="mt-2 flex flex-wrap gap-1">{l.map((a) => (
    <li key={a.path}><button type="button" onClick={() => abrirAnexo(a)} className="inline-flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-xs hover:bg-muted"><Paperclip className="size-3" />{a.nome}</button></li>
  ))}</ul>;
}

/* ------------------------------- Novo atendimento ------------------------------- */

export function NovoAtendimentoSheet({ ctx, base, onClose }: { ctx: CtxAtend; base: Partial<Row>; onClose: () => void }) {
  const { gestao, me, assuntos, espacos, mencionaveis, moradores, horarios, condominioId } = ctx;
  const agora = new Date();
  const [v, setV] = useState({
    para: s(base["aberto_para"]), unidade: s(base["unidade_id"]), assunto: s(base["assunto_id"]), titulo: s(base["titulo"]),
    espaco: "", local: "", data: agora.toLocaleDateString("sv-SE"), hora: String(agora.getHours()).padStart(2, "0"), min: String(agora.getMinutes()).padStart(2, "0"),
    texto: s(base["texto"]),
  });
  const [menc, setMenc] = useState<Row[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);
  const origem = s(base["origem_id"]);
  const opAssuntos = alfa(assuntos.filter((a) => a["status"] !== false && (gestao || a["visivel_morador"] !== false)).map((a) => ({ value: s(a["id"]), label: s(a["nome"]), hint: gestao ? `${s(a["sla_horas"])}h` : undefined })));
  const opMoradores = alfa(moradores.map((m) => ({ value: `${s(m["usuario_id"])}|${s(m["unidade_id"])}`, label: `${s(m["nome"])} — ${s(m["rotulo"])}` })));
  const opMenc = alfa(mencionaveis.filter((m) => !menc.some((x) => s(x["id"]) === s(m["id"]))).map((m) => ({ value: s(m["id"]), label: s(m["rotulo"]), hint: s(m["tipo"]) === "unidade" ? "Unidade" : "ADM" })));
  const opLocal = alfa(espacos.map((e) => ({ value: s(e["id"]), label: s(e["nome"]) })));
  const horas = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const mins = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

  const salvar = async () => {
    if (gestao && !v.para) { toast.error("Selecione o morador para quem o atendimento será aberto."); return; }
    if (!v.assunto) { toast.error("Escolha o assunto."); return; }
    if (v.titulo.trim().length < 3) { toast.error("Informe o título."); return; }
    if (!htmlParaTexto(v.texto).trim() && !files.length) { toast.error("Escreva a mensagem."); return; }
    setSalvando(true);
    try {
      const anexos = await enviarAnexos(condominioId, files);
      const as = assuntos.find((a) => s(a["id"]) === v.assunto);
      const local = v.espaco ? s(espacos.find((e) => s(e["id"]) === v.espaco)?.["nome"]) : v.local.trim();
      const [paraId, unidadeId] = gestao ? v.para.split("|") : [me, ""];
      const registro = {
        condominio_id: condominioId, assunto_id: v.assunto, titulo: v.titulo.trim().slice(0, 80), texto: htmlSeguro(v.texto), anexos,
        espaco_id: v.espaco || null, local: local || null,
        data_ocorrencia: v.data ? new Date(`${v.data}T${v.hora}:${v.min}:00`).toISOString() : null,
        aberto_por: me, aberto_por_gestao: gestao, aberto_para: paraId, unidade_id: unidadeId || null,
        mencionados: menc.map((m) => ({ tipo: s(m["tipo"]), id: s(m["id"]), rotulo: s(m["rotulo"]) })),
        origem_id: origem || null, status: "pendente_resposta",
        prazo_sla: prazoSla(new Date(), Number(as?.["sla_horas"] ?? 24), horarios).toISOString(),
      };
      const { data, error } = await db.from("cond_atendimentos").insert(registro).select("*").single();
      if (error) throw error;
      const n = await notificarInteracao(ctx, data as Row, gestao ? "A administração abriu um atendimento para você." : "Novo atendimento aberto por um morador.", v.texto);
      toast.success(`Atendimento ${numeroTicket((data as Row)["numero"])} aberto.${n ? ` ${n} aviso(s) por WhatsApp.` : ""}`);
      ctx.recarregar(); onClose(); ctx.abrir(s((data as Row)["id"]));
    } catch (e) { toast.error((e as Error).message || "Não foi possível abrir o atendimento."); } finally { setSalvando(false); }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="z-[90] flex w-full flex-col gap-0 p-0 sm:max-w-none lg:w-[60vw]">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{origem ? "Chamado lateral" : gestao ? "Novo atendimento" : "Abrir atendimento"}</SheetTitle>
          <SheetDescription>{origem ? `Vinculado ao atendimento ${numeroTicket(ctx.atendimentos.find((a) => s(a["id"]) === origem)?.["numero"])}. Quem foi mencionado não sabe quem reclamou.` : gestao ? "Abra em nome de um morador (ex.: quem tem dificuldade). Fica registrado que você abriu para ele." : "Somente você e a administração verão esta conversa."}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {gestao && (
            <div className="space-y-1.5"><Label>Aberto para (morador) *</Label>
              <SearchSelect value={v.para} onChange={(x) => setV({ ...v, para: x })} options={opMoradores} placeholder="Selecione o morador" emptyText="Nenhum morador vinculado às unidades." /></div>
          )}
          <div className="space-y-1.5"><Label>Assunto *</Label><SearchSelect value={v.assunto} onChange={(x) => setV({ ...v, assunto: x })} options={opAssuntos} placeholder="Selecione" emptyText="Nenhum assunto liberado para este condomínio." /></div>
          <div className="space-y-1.5"><Label htmlFor="at-tit">Título * <span className="text-xs font-normal text-muted-foreground">(máx. 80)</span></Label><Input id="at-tit" maxLength={80} value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label>Mencionar pessoa</Label>
            <p className="text-xs text-muted-foreground">Relaciona uma unidade ou alguém da administração. Visível somente para a administração. Pela LGPD, as unidades aparecem sem o nome do morador.</p>
            <SearchSelect value="" onChange={(x) => { const m = mencionaveis.find((y) => s(y["id"]) === x); if (m) setMenc([...menc, m]); }} options={opMenc} placeholder="Selecione…" />
            {menc.length > 0 && <div className="flex flex-wrap gap-1">{menc.map((m) => (
              <span key={s(m["id"])} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">{s(m["rotulo"])}<button type="button" aria-label="Remover menção" onClick={() => setMenc(menc.filter((x) => x !== m))}><X className="size-3" /></button></span>
            ))}</div>}
          </div>
          <div className="space-y-1.5">
            <Label>Local da ocorrência</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              <SearchSelect value={v.espaco} allowClear onChange={(x) => setV({ ...v, espaco: x, local: x ? "" : v.local })} options={opLocal} placeholder="Espaço social" emptyText="Nenhum espaço cadastrado." />
              <Input maxLength={100} value={v.local} disabled={!!v.espaco} onChange={(e) => setV({ ...v, local: e.target.value })} placeholder="Ou digite outro local" aria-label="Outro local" />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_110px_110px]">
            <div className="space-y-1.5"><Label>Data da ocorrência</Label><CampoData value={v.data} onChange={(x) => setV({ ...v, data: x })} inicio={2020} /></div>
            <div className="space-y-1.5"><Label>Hora</Label><SearchSelect value={v.hora} onChange={(x) => setV({ ...v, hora: x || "00" })} options={horas.map((h) => ({ value: h, label: h }))} /></div>
            <div className="space-y-1.5"><Label>Min</Label><SearchSelect value={v.min} onChange={(x) => setV({ ...v, min: x || "00" })} options={mins.map((h) => ({ value: h, label: h }))} /></div>
          </div>
          <div className="space-y-1.5"><Label>Mensagem *</Label><TextoRico value={v.texto} onChange={(h) => setV({ ...v, texto: h })} minHeight={180} enviarImagem={(f) => imagemNoTexto(condominioId, f)} placeholder="Descreva o que aconteceu. Você pode colar imagens." /></div>
          <SeletorArquivos files={files} setFiles={setFiles} />
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Abrir atendimento</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------- Ticket + chat vivo ------------------------------- */

export function AtendimentoSheet({ ctx, atendimento: a, onClose }: { ctx: CtxAtend; atendimento: Row; onClose: () => void }) {
  const { gestao, me, assuntos, condominioId, nomePessoa, atendimentos, mencionaveis, moradores } = ctx;
  const qc = useQueryClient();
  const id = s(a["id"]);
  const { data: msgs = [] } = useQuery({
    queryKey: ["cond", "atend-msgs", id],
    queryFn: async (): Promise<Row[]> => ((await db.from("cond_atend_mensagens").select("*").eq("atendimento_id", id).order("created_at")).data ?? []) as Row[],
    // Rede de segurança: mesmo sem tempo real, a conversa se atualiza a cada 4s enquanto aberta.
    refetchInterval: 4000, refetchIntervalInBackground: false, refetchOnWindowFocus: true,
  });
  // Tempo real: mensagem nova do outro lado aparece na hora.
  useEffect(() => {
    const ch = supabase.channel(`atend-msgs-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cond_atend_mensagens", filter: `atendimento_id=eq.${id}` },
        () => { void qc.invalidateQueries({ queryKey: ["cond", "atend-msgs", id] }); ctx.recarregar(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, qc]);
  const assunto = assuntos.find((x) => s(x["id"]) === s(a["assunto_id"]));
  const origem = atendimentos.find((x) => s(x["id"]) === s(a["origem_id"]));
  const laterais = atendimentos.filter((x) => s(x["origem_id"]) === id);
  const finalizado = a["status"] === "finalizado";
  const unidadeRot = (uid: unknown) => s(mencionaveis.find((m) => s(m["id"]) === s(uid))?.["rotulo"]);

  const [texto, setTexto] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [interna, setInterna] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [nota, setNota] = useState<number | null>(null);
  const [coment, setComent] = useState("");

  const enviar = async () => {
    if (!htmlParaTexto(texto).trim() && !files.length) return;
    setEnviando(true);
    try {
      const anexos = await enviarAnexos(condominioId, files);
      const { data: u } = await supabase.auth.getUser();
      const nomeMeu = s((u.user?.user_metadata as Row | undefined)?.["nome"]) || s(u.user?.email).split("@")[0];
      const { error } = await db.from("cond_atend_mensagens").insert({ atendimento_id: id, autor_id: me, autor_nome: gestao ? nomeMeu : null, autor_gestao: gestao, interna: gestao && interna, texto: htmlSeguro(texto), anexos });
      if (!error) dispararPush();
      if (error) throw error;
      setTexto(""); setFiles([]);
      qc.invalidateQueries({ queryKey: ["cond", "atend-msgs", id] }); ctx.recarregar();
      if (!(gestao && interna)) {
        const n = await notificarInteracao(ctx, a, gestao ? "A administração respondeu seu atendimento." : "O morador enviou uma nova mensagem.", texto);
        if (n) toast.success(`Mensagem enviada · ${n} aviso(s) por WhatsApp.`);
      }
    } catch (e) { toast.error((e as Error).message); } finally { setEnviando(false); }
  };

  const mudarStatus = async (st: string) => {
    if (st === s(a["status"])) return;
    if (st === "finalizado" && !(await confirmar({ title: "Finalizar atendimento?", description: "O morador será convidado a avaliar de 0 a 5 estrelas.", confirmText: "Finalizar" }))) return;
    const { error } = await db.from("cond_atendimentos").update({ status: st }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    ctx.recarregar();
    await notificarInteracao(ctx, a, st === "finalizado" ? "Seu atendimento foi finalizado. Avalie o atendimento de 0 a 5 estrelas no app." : `Status alterado para: ${statusAtend(st).morador}.`);
    toast.success(`Status: ${statusAtend(st).label}.`);
  };

  const avaliar = async () => {
    if (nota == null) return;
    const { error } = await db.rpc("cond_atend_avaliar", { p_atend: id, p_nota: nota, p_comentario: coment || null });
    if (error) { toast.error(error.message); return; }
    toast.success("Obrigado pela avaliação!"); ctx.recarregar();
  };

  const abrirLateral = (m: Row) => {
    const mor = moradores.find((x) => s(x["unidade_id"]) === s(m["id"]));
    ctx.novo({ origem_id: id, aberto_para: mor ? `${s(mor["usuario_id"])}|${s(mor["unidade_id"])}` : "", unidade_id: s(m["id"]), assunto_id: s(a["assunto_id"]), titulo: s(a["titulo"]).slice(0, 80) });
  };

  const conversa = useMemo(() => [
    { id: "abertura", autor_id: a["aberto_por"], autor_gestao: a["aberto_por_gestao"], autor_nome: null, interna: false, texto: a["texto"], anexos: a["anexos"], created_at: a["created_at"] } as Row,
    ...msgs,
  ], [a, msgs]);
  const nomeAutor = (m: Row) => (s(m["autor_id"]) === me ? "Você" : m["autor_gestao"] ? (s(m["autor_nome"]) || nomePessoa(m["autor_id"])) + " · Administração" : gestao ? nomePessoa(m["autor_id"]) : "Morador");

  const Cab = ({ r, l }: { r: string; l: React.ReactNode }) => <><dt className="text-muted-foreground">{r}</dt><dd className="font-medium">{l}</dd></>;
  const mencionados = ((a["mencionados"] as Row[]) ?? []);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="z-[90] flex w-full flex-col gap-0 p-0 sm:max-w-none lg:w-[60vw]">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex flex-wrap items-center gap-2"><span className="font-mono">{numeroTicket(a["numero"])}</span> {s(a["titulo"])}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2"><StatusBadge status={a["status"]} morador={!gestao} />{gestao && <SlaBadge sit={situacaoSla(a as never)} />}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div id={`enredo-${id}`} className="space-y-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
              <Cab r="Data abertura" l={dh(a["created_at"])} />
              <Cab r="Assunto" l={s(assunto?.["nome"]) || "—"} />
              <Cab r="Aberto para" l={`${nomePessoa(a["aberto_para"])}${a["unidade_id"] ? ` / ${unidadeRot(a["unidade_id"])}` : ""}`} />
              <Cab r="Solicitado por" l={`${nomePessoa(a["aberto_por"])}${a["aberto_por_gestao"] ? " / ADM" : ""}`} />
              <Cab r="Data ocorrência" l={dh(a["data_ocorrencia"])} />
              <Cab r="Local" l={s(a["local"]) || "—"} />
              {gestao && <Cab r="Pessoa mencionada" l={mencionados.length ? mencionados.map((m) => s(m["rotulo"])).join(", ") : "—"} />}
              {gestao && <Cab r="Prazo SLA" l={dh(a["prazo_sla"])} />}
              {a["avaliacao"] != null && <Cab r="Avaliação" l={`${"★".repeat(Number(a["avaliacao"]))}${"☆".repeat(5 - Number(a["avaliacao"]))}${s(a["avaliacao_comentario"]) ? ` — ${s(a["avaliacao_comentario"])}` : ""}`} />}
            </dl>

            {gestao && (origem || laterais.length > 0) && (
              <div className="rounded-lg border border-dashed p-3 text-sm">
                <div className="mb-1 inline-flex items-center gap-1 font-semibold"><GitBranch className="size-4" /> Enredo vinculado</div>
                {origem && <p>Originado de <button type="button" className="font-mono text-primary underline" onClick={() => ctx.abrir(s(origem["id"]))}>{numeroTicket(origem["numero"])}</button> — {s(origem["titulo"])} ({statusAtend(origem["status"]).label})</p>}
                {laterais.map((l) => <p key={s(l["id"])}>Chamado lateral <button type="button" className="font-mono text-primary underline" onClick={() => ctx.abrir(s(l["id"]))}>{numeroTicket(l["numero"])}</button> para {nomePessoa(l["aberto_para"])} — {statusAtend(l["status"]).label}</p>)}
              </div>
            )}

            <ol className="space-y-3" aria-label="Conversa">
              {conversa.filter((m) => gestao || !m["interna"]).map((m) => {
                const meu = s(m["autor_id"]) === me;
                return (
                  <li key={s(m["id"])} className={cn("flex", meu ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[85%] rounded-lg border p-3 text-sm", m["interna"] ? "border-amber-300 bg-amber-50 dark:bg-amber-500/10" : meu ? "bg-primary/10" : "bg-muted/40")}>
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{nomeAutor(m)}</span><span>{dh(m["created_at"])}</span>
                        {m["interna"] ? <span className="inline-flex items-center gap-0.5 text-amber-700"><Lock className="size-3" />Nota interna</span> : null}
                      </div>
                      <div className="prose prose-sm max-w-none break-words dark:prose-invert" dangerouslySetInnerHTML={{ __html: htmlSeguro(s(m["texto"])) }} />
                      <ListaAnexos anexos={m["anexos"]} />
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {!gestao && finalizado && a["avaliacao"] == null && (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-sm font-semibold">Como foi o atendimento?</p>
              <div className="flex gap-1" role="radiogroup" aria-label="Nota de 0 a 5">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={nota === n} aria-label={`${n} estrela(s)`} onClick={() => setNota(n)}
                    className={cn("rounded-md border px-2 py-1 text-sm", nota === n ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                    {n === 0 ? "0" : <span className="inline-flex items-center gap-0.5">{n}<Star className="size-3 fill-current" /></span>}
                  </button>
                ))}
              </div>
              <Textarea value={coment} maxLength={1000} onChange={(e) => setComent(e.target.value)} placeholder="Comentário (opcional)" />
              <div className="flex justify-end"><Button onClick={avaliar} disabled={nota == null}>Enviar avaliação</Button></div>
            </div>
          )}

          {gestao && mencionados.some((m) => s(m["tipo"]) === "unidade") && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Abrir chamado lateral para:</span>
              {mencionados.filter((m) => s(m["tipo"]) === "unidade").map((m) => (
                <Button key={s(m["id"])} size="sm" variant="outline" onClick={() => abrirLateral(m)}><GitBranch className="size-4" /> {s(m["rotulo"])}</Button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 border-t p-4">
          {finalizado && !gestao ? <p className="text-sm text-muted-foreground">Atendimento finalizado. Se precisar, abra um novo atendimento.</p> : (
            <>
              <TextoRico value={texto} onChange={setTexto} minHeight={90} enviarImagem={(f) => imagemNoTexto(condominioId, f)} placeholder={gestao ? "Responder ao morador…" : "Escreva sua mensagem…"} />
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div className="flex flex-wrap items-end gap-3">
                  <SeletorArquivos files={files} setFiles={setFiles} />
                  {gestao && <label className="inline-flex items-center gap-2 text-sm"><Switch checked={interna} onCheckedChange={setInterna} /> Nota interna (morador não vê)</label>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {gestao && <div className="w-52"><SearchSelect value={s(a["status"])} onChange={(v) => v && mudarStatus(v)} options={STATUS_ATEND.map((x) => ({ value: x.value, label: x.label }))} /></div>}
                  {gestao && <Button variant="outline" onClick={() => imprimirElemento(`enredo-${id}`)} aria-label="Imprimir enredo"><Printer className="size-4" /></Button>}
                  <Button variant="outline" onClick={onClose}>Fechar</Button>
                  <Button onClick={enviar} disabled={enviando}>{enviando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar</Button>
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
