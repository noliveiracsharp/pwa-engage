import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft, CheckCircle2, ClipboardCheck, FileSignature, Gavel, GripVertical, Lock, Maximize2, Megaphone, Pencil, Play, Plus, Printer,
  Search, ShieldCheck, Square, Timer, Trash2, UserCheck, Video, Vote, X,
} from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis, LabelList } from "recharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TextoRico } from "@/components/ui/texto-rico";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { useEmpresaAtiva } from "@/hooks/useEmpresaAtiva";
import { htmlParaTexto } from "@/lib/html-texto";
import { comprimirImagem } from "@/lib/image-compress";
import { imprimirElemento } from "@/lib/propostas";
import {
  OPCOES_PADRAO, QUORUNS, STATUS_ASSEMBLEIA, emSessao, segundaConvocacao, vereditoPauta,
  type OpcaoTotal, type Quorum, type StatusAssembleia,
} from "@/lib/assembleias";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { AcaoIcone } from "./AcaoIcone";
import { CampoData } from "./CampoData";
import { ordemNatural, s, useCondRows } from "./cond-data";

type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const CORES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--primary)"];
const COR_OPCAO: Record<string, string> = { sim: "var(--success)", nao: "var(--destructive)", abstencao: "var(--muted-foreground)" };
const COR_STATUS: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground", convocada: "bg-primary/15 text-primary", em_andamento: "bg-success/15 text-success",
  sessao_permanente: "bg-warning/20 text-foreground", finalizada: "bg-secondary text-secondary-foreground", cancelada: "bg-destructive/15 text-destructive",
};
const rotuloStatus = (v: string) => STATUS_ASSEMBLEIA.find((x) => x.value === v)?.label ?? v;
const rotuloQuorum = (v: string) => QUORUNS.find((x) => x.value === v)?.label ?? v;
const dtHora = (v: unknown) => (v ? new Date(s(v)).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const FORMATOS = [{ value: "mista", label: "Mista (presencial + online)" }, { value: "presencial", label: "Presencial" }, { value: "virtual", label: "Virtual" }];
const TIPOS = [{ value: "AGE", label: "AGE — Extraordinária" }, { value: "AGO", label: "AGO — Ordinária" }];
const CRITERIOS = [{ value: "fracao_ideal", label: "Fração ideal da unidade" }, { value: "unidade", label: "1 voto por unidade" }];
const erroMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Não foi possível concluir.");
const fmtPeso = (n: number, criterio: string) => (criterio === "unidade" ? String(Math.round(n)) : n.toLocaleString("pt-BR", { maximumFractionDigits: 4 }));

type Resultado = {
  total_condominio: number; unidades_total: number; presentes: number; presentes_peso: number; com_voto: number;
  pautas: { id: string; ordem: number; titulo: string; quorum: Quorum; status: string; opcoes: OpcaoTotal[] }[];
};

function useResultado(assembleiaId: string, tempoReal = false) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["cond", "assembleia-resultado", assembleiaId],
    enabled: !!assembleiaId,
    queryFn: async (): Promise<Resultado | null> => {
      const { data, error } = await db.rpc("cond_assembleia_resultado", { p_assembleia: assembleiaId });
      if (error) throw error;
      if (!data) return null;
      const r = data as Resultado;
      return { ...r, pautas: r.pautas.map((p) => ({ ...p, opcoes: p.opcoes.map((o) => ({ ...o, peso: Number(o.peso), votos: Number(o.votos) })) })) };
    },
    refetchInterval: tempoReal ? 15_000 : false,
  });
  useEffect(() => {
    if (!tempoReal || !assembleiaId) return;
    const inval = () => { qc.invalidateQueries({ queryKey: ["cond", "assembleia-resultado", assembleiaId] }); qc.invalidateQueries({ queryKey: ["cond", "cond_assembleia_pautas"] }); qc.invalidateQueries({ queryKey: ["cond", "cond_assembleia_presencas"] }); };
    const ch = supabase.channel(`assembleia-${assembleiaId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cond_assembleia_votos", filter: `assembleia_id=eq.${assembleiaId}` }, inval)
      .on("postgres_changes", { event: "*", schema: "public", table: "cond_assembleia_pautas", filter: `assembleia_id=eq.${assembleiaId}` }, inval)
      .on("postgres_changes", { event: "*", schema: "public", table: "cond_assembleia_presencas", filter: `assembleia_id=eq.${assembleiaId}` }, inval)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tempoReal, assembleiaId, qc]);
  return q;
}

/** Assembleias: gestão (síndico/administradora por perfil) e participação dos condôminos. */
export function AssembleiasPanel({ condominioId, blocos, unidades, perms }: { condominioId: string; blocos: Row[]; unidades: Row[]; perms: Perms }) {
  const gestor = perms.canCreate || perms.canUpdate;
  if (!gestor) return <AssembleiasMorador condominioId={condominioId} />;
  return (
    <Tabs defaultValue="gestao" className="space-y-3">
      <TabsList>
        <TabsTrigger value="gestao">Gestão</TabsTrigger>
        <TabsTrigger value="participar">Participar</TabsTrigger>
      </TabsList>
      <TabsContent value="gestao"><Gestao condominioId={condominioId} blocos={blocos} unidades={unidades} perms={perms} /></TabsContent>
      <TabsContent value="participar"><AssembleiasMorador condominioId={condominioId} /></TabsContent>
    </Tabs>
  );
}

/* ------------------------------- Gestão ------------------------------- */

function Gestao({ condominioId, blocos, unidades, perms }: { condominioId: string; blocos: Row[]; unidades: Row[]; perms: Perms }) {
  const qc = useQueryClient();
  const { data: lista = [] } = useCondRows("cond_assembleias", "condominio_id", condominioId);
  const [busca, setBusca] = useState("");
  const [editar, setEditar] = useState<Row | "nova" | null>(null);
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const aberta = lista.find((a) => s(a["id"]) === abertaId) ?? null;
  const termo = busca.trim().toLowerCase();
  const filtradas = [...lista]
    .sort((a, b) => s(b["data_hora"] ?? b["created_at"]).localeCompare(s(a["data_hora"] ?? a["created_at"])))
    .filter((a) => !termo || `${s(a["titulo"])} ${s(a["tipo"])} ${rotuloStatus(s(a["status"]))}`.toLowerCase().includes(termo));
  const recarregar = () => qc.invalidateQueries({ queryKey: ["cond", "cond_assembleias"] });

  if (aberta) return <Detalhe assembleia={aberta} blocos={blocos} unidades={unidades} perms={perms} onVoltar={() => setAbertaId(null)} onEditar={() => setEditar(aberta)} onAtualizar={recarregar} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input className="pl-8" placeholder="Buscar assembleia" aria-label="Buscar assembleia" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {perms.canCreate && <Button onClick={() => setEditar("nova")}><Plus className="size-4" /> Nova assembleia</Button>}
      </div>
      {filtradas.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          <Gavel className="mx-auto mb-2 size-8 opacity-60" aria-hidden />
          {lista.length ? "Nenhuma assembleia encontrada." : "Nenhuma assembleia cadastrada. Crie a primeira como rascunho."}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtradas.map((a) => (
            <li key={s(a["id"])}>
              <button type="button" onClick={() => setAbertaId(s(a["id"]))}
                className="flex h-full w-full flex-col gap-2 rounded-lg border bg-card p-4 text-left transition hover:border-primary/50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{s(a["tipo"])}</Badge>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", COR_STATUS[s(a["status"])])}>{rotuloStatus(s(a["status"]))}</span>
                  {s(a["formato"]) !== "presencial" && <Video className="size-4 text-muted-foreground" aria-label="Com transmissão online" />}
                </div>
                <h3 className="font-semibold leading-tight">{s(a["titulo"])}</h3>
                <p className="text-xs text-muted-foreground">1ª convocação: {dtHora(a["data_hora"])} · {FORMATOS.find((f) => f.value === s(a["formato"]))?.label}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editar && <AssembleiaSheet condominioId={condominioId} assembleia={editar === "nova" ? null : editar} onClose={() => setEditar(null)}
        onSalvo={(id) => { recarregar(); setEditar(null); if (id) setAbertaId(id); }} />}
    </div>
  );
}

/* ------------------------- Cadastro (dados gerais) ------------------------- */

const isoLocal = (iso: unknown) => {
  if (!iso) return { data: "", hora: "" };
  const d = new Date(s(iso));
  const p = (n: number) => String(n).padStart(2, "0");
  return { data: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, hora: `${p(d.getHours())}:${p(d.getMinutes())}` };
};
const juntar = (data: string, hora: string) => (data ? new Date(`${data}T${hora || "00:00"}:00`).toISOString() : null);

function CampoDataHora({ id, rotulo, valor, onChange }: { id: string; rotulo: string; valor: { data: string; hora: string }; onChange: (v: { data: string; hora: string }) => void }) {
  return (
    <div>
      <Label htmlFor={id} className="mb-1.5 block">{rotulo}</Label>
      <div className="flex gap-2">
        <div className="flex-1"><CampoData id={id} value={valor.data} onChange={(d) => onChange({ ...valor, data: d })} inicio={2020} /></div>
        <Input type="time" aria-label={`${rotulo} — horário`} className="w-28" value={valor.hora} onChange={(e) => onChange({ ...valor, hora: e.target.value })} />
      </div>
    </div>
  );
}

function AssembleiaSheet({ condominioId, assembleia, onClose, onSalvo }: { condominioId: string; assembleia: Row | null; onClose: () => void; onSalvo: (id?: string) => void }) {
  const a = assembleia ?? {};
  const [v, setV] = useState({
    titulo: s(a["titulo"]), tipo: s(a["tipo"]) || "AGE", formato: s(a["formato"]) || "mista", local: s(a["local"]), link_video: s(a["link_video"]),
    edital: s(a["edital"]), criterio_peso: s(a["criterio_peso"]) || "fracao_ideal", limite_procuracoes: String(a["limite_procuracoes"] ?? 0),
    presidente: s(a["presidente"]), secretario: s(a["secretario"]),
  });
  const [d1, setD1] = useState(isoLocal(a["data_hora"]));
  const [d2, setD2] = useState(isoLocal(a["data_hora_2a"]));
  const [salvando, setSalvando] = useState(false);
  const online = v.formato !== "presencial";
  const salvar = async () => {
    if (!v.titulo.trim()) { toast.error("Informe o título da assembleia."); return; }
    if (online && v.link_video && !/^https?:\/\//i.test(v.link_video.trim())) { toast.error("O link da sala deve começar com https://"); return; }
    const p1 = juntar(d1.data, d1.hora);
    const p2 = juntar(d2.data, d2.hora) ?? (p1 ? segundaConvocacao(p1) : null);
    if (p1 && p2 && new Date(p2) <= new Date(p1)) { toast.error("A 2ª convocação deve ser depois da 1ª."); return; }
    setSalvando(true);
    const valores = {
      condominio_id: condominioId, titulo: v.titulo.trim(), tipo: v.tipo, formato: v.formato, local: v.local.trim() || null,
      link_video: online ? v.link_video.trim() || null : null, edital: v.edital || null, criterio_peso: v.criterio_peso,
      limite_procuracoes: Math.max(0, Number(v.limite_procuracoes) || 0), presidente: v.presidente.trim() || null, secretario: v.secretario.trim() || null,
      data_hora: p1, data_hora_2a: p2, updated_at: new Date().toISOString(),
    };
    const r = assembleia ? await db.from("cond_assembleias").update(valores).eq("id", s(a["id"])).select("id").single()
      : await db.from("cond_assembleias").insert(valores).select("id").single();
    setSalvando(false);
    if (r.error) { toast.error(erroMsg(r.error)); return; }
    toast.success(assembleia ? "Assembleia atualizada." : "Assembleia criada como rascunho.");
    onSalvo(assembleia ? undefined : s(r.data?.id));
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-none lg:w-[60vw]">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{assembleia ? "Editar assembleia" : "Nova assembleia"}</SheetTitle>
          <SheetDescription>Dados da convocação. A assembleia nasce como rascunho e só os gestores a veem.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div><Label htmlFor="as-tit" className="mb-1.5 block">Título *</Label><Input id="as-tit" value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} placeholder="Ex.: AGE — Reforma da fachada" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label className="mb-1.5 block">Tipo</Label><SearchSelect value={v.tipo} onChange={(x) => setV({ ...v, tipo: x || "AGE" })} options={TIPOS} /></div>
            <div><Label className="mb-1.5 block">Formato</Label><SearchSelect value={v.formato} onChange={(x) => setV({ ...v, formato: x || "mista" })} options={FORMATOS.slice().sort((x, y) => x.label.localeCompare(y.label, "pt-BR"))} /></div>
            <CampoDataHora id="as-d1" rotulo="1ª convocação" valor={d1} onChange={setD1} />
            <CampoDataHora id="as-d2" rotulo="2ª convocação (padrão: 30 min depois)" valor={d2} onChange={setD2} />
            <div><Label htmlFor="as-local" className="mb-1.5 block">Local</Label><Input id="as-local" value={v.local} onChange={(e) => setV({ ...v, local: e.target.value })} placeholder="Ex.: Salão de festas" /></div>
            {online && <div><Label htmlFor="as-link" className="mb-1.5 block">Link da sala de vídeo</Label><Input id="as-link" type="url" value={v.link_video} onChange={(e) => setV({ ...v, link_video: e.target.value })} placeholder="https://meet.google.com/..." /></div>}
            <div><Label className="mb-1.5 block">Peso do voto</Label><SearchSelect value={v.criterio_peso} onChange={(x) => setV({ ...v, criterio_peso: x || "fracao_ideal" })} options={CRITERIOS} /></div>
            <div><Label htmlFor="as-lim" className="mb-1.5 block">Limite de procurações por pessoa (0 = sem limite)</Label><Input id="as-lim" type="number" min={0} value={v.limite_procuracoes} onChange={(e) => setV({ ...v, limite_procuracoes: e.target.value })} /></div>
            <div><Label htmlFor="as-pres" className="mb-1.5 block">Presidente da mesa</Label><Input id="as-pres" value={v.presidente} onChange={(e) => setV({ ...v, presidente: e.target.value })} /></div>
            <div><Label htmlFor="as-sec" className="mb-1.5 block">Secretário(a)</Label><Input id="as-sec" value={v.secretario} onChange={(e) => setV({ ...v, secretario: e.target.value })} /></div>
          </div>
          <div><Label className="mb-1.5 block">Edital de convocação</Label><TextoRico value={v.edital} onChange={(h) => setV({ ...v, edital: h })} minHeight={160} placeholder="Texto do edital enviado aos condôminos" /></div>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------- Detalhe ------------------------------- */

function Detalhe({ assembleia: a, blocos, unidades, perms, onVoltar, onEditar, onAtualizar }: {
  assembleia: Row; blocos: Row[]; unidades: Row[]; perms: Perms; onVoltar: () => void; onEditar: () => void; onAtualizar: () => void;
}) {
  const id = s(a["id"]);
  const st = s(a["status"]) as StatusAssembleia;
  const [permanente, setPermanente] = useState(false);
  const mudar = async (status: StatusAssembleia, extra: Row = {}, msg?: string) => {
    const { error } = await db.from("cond_assembleias").update({ status, updated_at: new Date().toISOString(), ...extra }).eq("id", id);
    if (error) { toast.error(erroMsg(error)); return; }
    toast.success(msg ?? `Assembleia: ${rotuloStatus(status)}.`); onAtualizar();
  };
  const finalizar = async () => {
    if (!(await confirmar({ titulo: "Finalizar assembleia?", descricao: "As pautas em votação serão encerradas e ninguém poderá votar mais.", confirmar: "Finalizar" }))) return;
    await db.from("cond_assembleia_pautas").update({ status: "encerrada", encerrada_em: new Date().toISOString() }).eq("assembleia_id", id).eq("status", "em_votacao");
    await mudar("finalizada", { finalizada_em: new Date().toISOString() }, "Assembleia finalizada. Gere a ata na aba Ata.");
  };
  const excluir = async () => {
    if (!(await confirmar({ titulo: "Excluir assembleia?", descricao: "Só rascunhos podem ser excluídos.", confirmar: "Excluir", destrutivo: true }))) return;
    const { error } = await db.from("cond_assembleias").delete().eq("id", id);
    if (error) toast.error(erroMsg(error)); else { toast.success("Assembleia excluída."); onAtualizar(); onVoltar(); }
  };
  const pode = perms.canUpdate;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-2">
        <Button variant="ghost" size="icon" onClick={onVoltar} aria-label="Voltar para a lista"><ArrowLeft className="size-4" /></Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold leading-tight">{s(a["titulo"])}</h2>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", COR_STATUS[st])}>{rotuloStatus(st)}</span>
          </div>
          <p className="text-xs text-muted-foreground">{s(a["tipo"])} · 1ª {dtHora(a["data_hora"])} · 2ª {dtHora(a["data_hora_2a"])}{a["local"] ? ` · ${s(a["local"])}` : ""}
            {st === "sessao_permanente" && a["sessao_ate"] ? ` · votação até ${dtHora(a["sessao_ate"])}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {s(a["link_video"]) && <Button variant="outline" asChild><a href={s(a["link_video"])} target="_blank" rel="noreferrer"><Video className="size-4" /> Entrar na sala</a></Button>}
          {pode && st !== "finalizada" && st !== "cancelada" && <AcaoIcone titulo="Editar dados" onClick={onEditar}><Pencil className="size-4" /></AcaoIcone>}
          {perms.canDelete && st === "rascunho" && <AcaoIcone titulo="Excluir rascunho" destrutivo onClick={excluir}><Trash2 className="size-4" /></AcaoIcone>}
          {pode && st === "rascunho" && <Button onClick={() => mudar("convocada", {}, "Assembleia convocada: os condôminos já a veem no portal.")}><Megaphone className="size-4" /> Convocar</Button>}
          {pode && st === "convocada" && <Button onClick={() => mudar("em_andamento", { aberta_em: new Date().toISOString() }, "Sessão aberta.")}><Play className="size-4" /> Abrir sessão</Button>}
          {pode && st === "em_andamento" && <Button variant="outline" onClick={() => setPermanente(true)}><Timer className="size-4" /> Sessão permanente</Button>}
          {pode && emSessao(st) && <Button variant="destructive" onClick={finalizar}><Square className="size-4" /> Finalizar</Button>}
        </div>
      </div>
      <Tabs defaultValue="pautas" className="space-y-3">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="config"><Gavel className="size-4 sm:mr-1" aria-hidden /><span className="sr-only sm:not-sr-only">Configurações</span></TabsTrigger>
          <TabsTrigger value="pautas"><Vote className="size-4 sm:mr-1" aria-hidden /><span className="sr-only sm:not-sr-only">Pautas</span></TabsTrigger>
          <TabsTrigger value="recepcao"><UserCheck className="size-4 sm:mr-1" aria-hidden /><span className="sr-only sm:not-sr-only">Recepção</span></TabsTrigger>
          <TabsTrigger value="telao"><Maximize2 className="size-4 sm:mr-1" aria-hidden /><span className="sr-only sm:not-sr-only">Telão</span></TabsTrigger>
          <TabsTrigger value="ata"><FileSignature className="size-4 sm:mr-1" aria-hidden /><span className="sr-only sm:not-sr-only">Ata e auditoria</span></TabsTrigger>
        </TabsList>
        <TabsContent value="config"><Configuracoes a={a} /></TabsContent>
        <TabsContent value="pautas"><Pautas assembleia={a} unidades={unidades} blocos={blocos} pode={pode} /></TabsContent>
        <TabsContent value="recepcao"><Recepcao assembleia={a} unidades={unidades} blocos={blocos} pode={pode} /></TabsContent>
        <TabsContent value="telao"><Telao assembleia={a} /></TabsContent>
        <TabsContent value="ata"><Ata assembleia={a} unidades={unidades} blocos={blocos} pode={pode} onAtualizar={onAtualizar} /></TabsContent>
      </Tabs>
      {permanente && <SessaoPermanenteDialog onClose={() => setPermanente(false)} onConfirmar={async (ate) => { setPermanente(false); await mudar("sessao_permanente", { sessao_ate: ate }, "Sessão permanente ativa: as pautas abertas seguem recebendo votos até o prazo."); }} />}
    </div>
  );
}

function SessaoPermanenteDialog({ onClose, onConfirmar }: { onClose: () => void; onConfirmar: (ate: string | null) => void }) {
  const [v, setV] = useState({ data: "", hora: "18:00" });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sessão permanente</DialogTitle>
          <DialogDescription>Lei 14.309/2022: a assembleia fica aberta e as pautas em votação continuam recebendo votos até a data limite (máximo 90 dias).</DialogDescription>
        </DialogHeader>
        <CampoDataHora id="sp-ate" rotulo="Votação aberta até" valor={v} onChange={setV} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => {
            const ate = juntar(v.data, v.hora);
            if (!ate || new Date(ate) <= new Date()) { toast.error("Escolha uma data futura."); return; }
            if (new Date(ate).getTime() - Date.now() > 90 * 86_400_000) { toast.error("A sessão permanente pode durar no máximo 90 dias."); return; }
            onConfirmar(ate);
          }}>Ativar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Configuracoes({ a }: { a: Row }) {
  const linhas: [string, string][] = [
    ["Tipo", TIPOS.find((t) => t.value === s(a["tipo"]))?.label ?? s(a["tipo"])],
    ["Formato", FORMATOS.find((f) => f.value === s(a["formato"]))?.label ?? ""],
    ["1ª convocação", dtHora(a["data_hora"])], ["2ª convocação", dtHora(a["data_hora_2a"])],
    ["Local", s(a["local"]) || "—"], ["Peso do voto", CRITERIOS.find((c) => c.value === s(a["criterio_peso"]))?.label ?? ""],
    ["Limite de procurações", Number(a["limite_procuracoes"]) > 0 ? `${s(a["limite_procuracoes"])} por pessoa` : "Sem limite"],
    ["Presidente", s(a["presidente"]) || "A definir"], ["Secretário(a)", s(a["secretario"]) || "A definir"],
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border bg-card p-4 text-sm">
        {linhas.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}
      </dl>
      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold">Edital</h3>
        {s(a["edital"]) ? <div className="prose prose-sm max-w-none text-sm dark:prose-invert" dangerouslySetInnerHTML={{ __html: s(a["edital"]) }} /> : <p className="text-sm text-muted-foreground">Sem edital. Use Editar dados para escrever.</p>}
      </div>
    </div>
  );
}

/* ------------------------------- Pautas ------------------------------- */

function Pautas({ assembleia: a, unidades, blocos, pode }: { assembleia: Row; unidades: Row[]; blocos: Row[]; pode: boolean }) {
  const id = s(a["id"]);
  const st = s(a["status"]);
  const qc = useQueryClient();
  const { data: pautas = [] } = useCondRows("cond_assembleia_pautas", "assembleia_id", id, "ordem");
  const { data: res } = useResultado(id, emSessao(st));
  const [editar, setEditar] = useState<Row | "nova" | null>(null);
  const [mesa, setMesa] = useState<Row | null>(null);
  const [ordem, setOrdem] = useState<string[]>([]);
  useEffect(() => { setOrdem(pautas.map((p) => s(p["id"]))); }, [pautas]);
  const porId = useMemo(() => new Map(pautas.map((p) => [s(p["id"]), p])), [pautas]);
  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const recarregar = () => { qc.invalidateQueries({ queryKey: ["cond", "cond_assembleia_pautas"] }); qc.invalidateQueries({ queryKey: ["cond", "assembleia-resultado", id] }); };
  const editavel = pode && st !== "finalizada" && st !== "cancelada";
  const soltar = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const nova = arrayMove(ordem, ordem.indexOf(String(e.active.id)), ordem.indexOf(String(e.over.id)));
    setOrdem(nova);
    const r = await Promise.all(nova.map((pid, i) => db.from("cond_assembleia_pautas").update({ ordem: i + 1 }).eq("id", pid)));
    if (r.some((x) => x.error)) toast.error("Não foi possível salvar a nova ordem.");
    recarregar();
  };
  const mudarPauta = async (p: Row, status: string) => {
    if (status === "em_votacao" && !emSessao(st)) { toast.error("Abra a sessão da assembleia antes de iniciar a votação."); return; }
    if (status === "encerrada" && !(await confirmar({ titulo: "Encerrar votação?", descricao: "Depois de encerrada, a pauta não recebe mais votos.", confirmar: "Encerrar" }))) return;
    const extra = status === "em_votacao" ? { aberta_em: new Date().toISOString() } : { encerrada_em: new Date().toISOString() };
    const { error } = await db.from("cond_assembleia_pautas").update({ status, ...extra }).eq("id", s(p["id"]));
    if (error) toast.error(erroMsg(error)); else { toast.success(status === "em_votacao" ? "Votação aberta." : "Votação encerrada."); recarregar(); }
  };
  const excluir = async (p: Row) => {
    if (!(await confirmar({ titulo: "Excluir pauta?", descricao: s(p["titulo"]), confirmar: "Excluir", destrutivo: true }))) return;
    const { error } = await db.from("cond_assembleia_pautas").delete().eq("id", s(p["id"]));
    if (error) toast.error(erroMsg(error)); else recarregar();
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{editavel ? "Arraste pela alça (ou use espaço e as setas) para mudar a ordem." : "Ordem do dia."}</p>
        {editavel && <Button onClick={() => setEditar("nova")}><Plus className="size-4" /> Nova pauta</Button>}
      </div>
      {pautas.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma pauta. Adicione os itens da ordem do dia.</div>
      ) : (
        <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={soltar}>
          <SortableContext items={ordem} strategy={verticalListSortingStrategy}>
            <ol className="space-y-2">
              {ordem.map((pid, i) => {
                const p = porId.get(pid);
                if (!p) return null;
                const r = res?.pautas.find((x) => x.id === pid);
                return (
                  <PautaItem key={pid} id={pid} n={i + 1} pauta={p} resultado={r} total={res?.total_condominio ?? 0} criterio={s(a["criterio_peso"])} arrastavel={editavel}>
                    {pode && s(p["status"]) === "aguardando" && emSessao(st) && <Button size="sm" onClick={() => mudarPauta(p, "em_votacao")}><Play className="size-4" /> Abrir votação</Button>}
                    {pode && s(p["status"]) === "em_votacao" && <Button size="sm" variant="outline" onClick={() => setMesa(p)}><ClipboardCheck className="size-4" /> Voto da mesa</Button>}
                    {pode && s(p["status"]) === "em_votacao" && <Button size="sm" variant="destructive" onClick={() => mudarPauta(p, "encerrada")}><Lock className="size-4" /> Encerrar</Button>}
                    {editavel && s(p["status"]) === "aguardando" && <AcaoIcone titulo="Editar pauta" onClick={() => setEditar(p)}><Pencil className="size-4" /></AcaoIcone>}
                    {editavel && s(p["status"]) === "aguardando" && <AcaoIcone titulo="Excluir pauta" destrutivo onClick={() => excluir(p)}><Trash2 className="size-4" /></AcaoIcone>}
                  </PautaItem>
                );
              })}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      {editar && <PautaDialog assembleiaId={id} pauta={editar === "nova" ? null : editar} proxima={pautas.length + 1} onClose={() => setEditar(null)} onSalvo={() => { setEditar(null); recarregar(); }} />}
      {mesa && <VotoMesaDialog assembleia={a} pauta={mesa} unidades={unidades} blocos={blocos} onClose={() => setMesa(null)} onSalvo={recarregar} />}
    </div>
  );
}

function PautaItem({ id, n, pauta: p, resultado, total, criterio, arrastavel, children }: {
  id: string; n: number; pauta: Row; resultado: Resultado["pautas"][number] | undefined; total: number; criterio: string; arrastavel: boolean; children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !arrastavel });
  const st = s(p["status"]);
  const ver = resultado ? vereditoPauta(resultado.quorum, resultado.opcoes, total) : null;
  const votos = resultado?.opcoes.reduce((acc, o) => acc + o.votos, 0) ?? 0;
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("rounded-lg border bg-card p-3", isDragging && "z-10 shadow-lg", st === "em_votacao" && "border-success/60")}>
      <div className="flex flex-wrap items-start gap-2">
        {arrastavel && <button type="button" className="mt-0.5 cursor-grab rounded p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Mover pauta ${n}`} {...attributes} {...listeners}><GripVertical className="size-4" /></button>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{n}. {s(p["titulo"])}</span>
            <Badge variant="outline" className={cn(st === "em_votacao" && "border-success/50 text-success", st === "encerrada" && "bg-muted")}>{st === "em_votacao" ? "Em votação" : st === "encerrada" ? "Encerrada" : "Aguardando"}</Badge>
            <span className="text-xs text-muted-foreground">{rotuloQuorum(s(p["quorum"]))}</span>
          </div>
          {s(p["descricao"]) && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{htmlParaTexto(s(p["descricao"]))}</p>}
          {resultado && st !== "aguardando" && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {resultado.opcoes.map((o) => <span key={o.id}><strong>{o.descricao}</strong>: {o.votos} ({fmtPeso(o.peso, criterio)})</span>)}
              <span className="text-muted-foreground">· {votos} voto(s)</span>
              {ver && st === "encerrada" && <Badge className={cn(ver.situacao === "aprovada" ? "bg-success text-success-foreground" : ver.situacao === "reprovada" ? "bg-destructive text-destructive-foreground" : "bg-muted text-foreground")}>{ver.texto}</Badge>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">{children}</div>
      </div>
    </li>
  );
}

function PautaDialog({ assembleiaId, pauta, proxima, onClose, onSalvo }: { assembleiaId: string; pauta: Row | null; proxima: number; onClose: () => void; onSalvo: () => void }) {
  const p = pauta ?? {};
  const [titulo, setTitulo] = useState(s(p["titulo"]));
  const [descricao, setDescricao] = useState(s(p["descricao"]));
  const [quorum, setQuorum] = useState<Quorum>((s(p["quorum"]) as Quorum) || "simples");
  const { data: opcoesAtuais = [] } = useCondRows("cond_assembleia_opcoes_voto", "pauta_id", pauta ? s(p["id"]) : undefined, "ordem");
  const [chapas, setChapas] = useState<string[]>(["", ""]);
  useEffect(() => { if (pauta && s(p["quorum"]) === "eleicao" && opcoesAtuais.length) setChapas(opcoesAtuais.filter((o) => s(o["tipo"]) === "outro").map((o) => s(o["descricao"]))); }, [opcoesAtuais]); // eslint-disable-line react-hooks/exhaustive-deps
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    if (!titulo.trim()) { toast.error("Informe o título da pauta."); return; }
    const nomes = chapas.map((c) => c.trim()).filter(Boolean);
    if (quorum === "eleicao" && nomes.length < 2) { toast.error("Informe pelo menos duas opções (chapas, candidatos ou orçamentos)."); return; }
    setSalvando(true);
    try {
      const valores = { assembleia_id: assembleiaId, titulo: titulo.trim(), descricao: descricao || null, quorum };
      let pid = s(p["id"]);
      if (pauta) { const r = await db.from("cond_assembleia_pautas").update(valores).eq("id", pid); if (r.error) throw r.error; }
      else { const r = await db.from("cond_assembleia_pautas").insert({ ...valores, ordem: proxima }).select("id").single(); if (r.error) throw r.error; pid = s(r.data.id); }
      const mudouOpcoes = !pauta || quorum !== s(p["quorum"]) || quorum === "eleicao";
      if (mudouOpcoes) {
        const d = await db.from("cond_assembleia_opcoes_voto").delete().eq("pauta_id", pid); if (d.error) throw d.error;
        const linhas = quorum === "eleicao"
          ? [...nomes.map((nm, i) => ({ pauta_id: pid, ordem: i + 1, descricao: nm, tipo: "outro" })), { pauta_id: pid, ordem: nomes.length + 1, descricao: "Abstenção", tipo: "abstencao" }]
          : OPCOES_PADRAO.map((o, i) => ({ pauta_id: pid, ordem: i + 1, descricao: o.descricao, tipo: o.tipo }));
        const r = await db.from("cond_assembleia_opcoes_voto").insert(linhas); if (r.error) throw r.error;
      }
      toast.success("Pauta salva."); onSalvo();
    } catch (e) { toast.error(erroMsg(e)); } finally { setSalvando(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>{pauta ? "Editar pauta" : "Nova pauta"}</DialogTitle><DialogDescription>O quórum define como o resultado é apurado.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="pa-tit" className="mb-1.5 block">Título *</Label><Input id="pa-tit" value={titulo} onChange={(e) => setTitulo(e.target.value)} /></div>
          <div><Label className="mb-1.5 block">Descrição / material para debate</Label><TextoRico value={descricao} onChange={setDescricao} minHeight={120} /></div>
          <div>
            <Label className="mb-1.5 block">Quórum de aprovação</Label>
            <SearchSelect value={quorum} onChange={(x) => setQuorum((x || "simples") as Quorum)} options={QUORUNS.map((q) => ({ value: q.value, label: q.label })).sort((x, y) => x.label.localeCompare(y.label, "pt-BR"))} />
            <p className="mt-1 text-xs text-muted-foreground">{QUORUNS.find((q) => q.value === quorum)?.ajuda}</p>
          </div>
          {quorum === "eleicao" ? (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">Opções de voto</legend>
              {chapas.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <Input aria-label={`Opção ${i + 1}`} value={c} placeholder={`Ex.: Chapa ${i + 1}`} onChange={(e) => setChapas(chapas.map((x, j) => (j === i ? e.target.value : x)))} />
                  {chapas.length > 2 && <AcaoIcone titulo="Remover opção" destrutivo onClick={() => setChapas(chapas.filter((_, j) => j !== i))}><X className="size-4" /></AcaoIcone>}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setChapas([...chapas, ""])}><Plus className="size-4" /> Adicionar opção</Button>
              <p className="text-xs text-muted-foreground">“Abstenção” entra automaticamente.</p>
            </fieldset>
          ) : <p className="text-xs text-muted-foreground">Opções de voto: Sim, Não e Abstenção.</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const rotuloUnidade = (u: Row, blocos: Row[]) => {
  const b = blocos.find((x) => s(x["id"]) === s(u["cond_bloco_id"]));
  return b ? `${s(b["nome"] ?? b["descricao"])} · ${s(u["numero"])}` : s(u["numero"]);
};

function VotoMesaDialog({ assembleia: a, pauta, unidades, blocos, onClose, onSalvo }: { assembleia: Row; pauta: Row; unidades: Row[]; blocos: Row[]; onClose: () => void; onSalvo: () => void }) {
  const { data: presencas = [] } = useCondRows("cond_assembleia_presencas", "assembleia_id", s(a["id"]));
  const { data: opcoes = [] } = useCondRows("cond_assembleia_opcoes_voto", "pauta_id", s(pauta["id"]), "ordem");
  const { data: votos = [] } = useCondRows("cond_assembleia_votos", "pauta_id", s(pauta["id"]));
  const [unidade, setUnidade] = useState("");
  const [opcao, setOpcao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const jaVotou = new Set(votos.map((v) => s(v["unidade_id"])));
  const aptas = presencas.filter((p) => p["direito_voto"] && !jaVotou.has(s(p["unidade_id"])))
    .map((p) => { const u = unidades.find((x) => s(x["id"]) === s(p["unidade_id"])); return { value: s(p["unidade_id"]), label: u ? rotuloUnidade(u, blocos) : "Unidade", hint: s(p["pessoa_nome"]) || undefined }; })
    .sort((x, y) => ordemNatural(x.label, y.label));
  const registrar = async () => {
    if (!unidade || !opcao) return;
    setEnviando(true);
    const { error } = await db.rpc("cond_assembleia_votar", { p_pauta: s(pauta["id"]), p_opcao: opcao, p_unidade: unidade, p_user_agent: `mesa · ${navigator.userAgent}` });
    setEnviando(false);
    if (error) { toast.error(erroMsg(error)); return; }
    toast.success("Voto registrado na trilha de auditoria."); setUnidade(""); setOpcao(""); onSalvo();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
        <DialogHeader><DialogTitle>Voto da mesa</DialogTitle><DialogDescription>{s(pauta["titulo"])} — para quem está no salão e vota em voz alta ou cédula.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label className="mb-1.5 block">Unidade presente com direito a voto</Label><SearchSelect value={unidade} onChange={setUnidade} options={aptas} placeholder="Selecione a unidade" emptyText="Nenhuma unidade apta sem voto." /></div>
          <div role="radiogroup" aria-label="Opção de voto" className="grid gap-2">
            {opcoes.map((o) => (
              <button key={s(o["id"])} type="button" role="radio" aria-checked={opcao === s(o["id"])} onClick={() => setOpcao(s(o["id"]))}
                className={cn("rounded-md border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", opcao === s(o["id"]) ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted")}>{s(o["descricao"])}</button>
            ))}
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button><Button onClick={registrar} disabled={!unidade || !opcao || enviando}>{enviando ? "Registrando…" : "Registrar voto"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Recepção ------------------------------ */

function Recepcao({ assembleia: a, unidades, blocos, pode }: { assembleia: Row; unidades: Row[]; blocos: Row[]; pode: boolean }) {
  const id = s(a["id"]);
  const qc = useQueryClient();
  const { data: presencas = [] } = useCondRows("cond_assembleia_presencas", "assembleia_id", id);
  const [busca, setBusca] = useState("");
  const [checkin, setCheckin] = useState<Row | null>(null);
  const porUnidade = useMemo(() => new Map(presencas.map((p) => [s(p["unidade_id"]), p])), [presencas]);
  const termo = busca.trim().toLowerCase();
  const lista = unidades.filter((u) => u["status"] !== false)
    .map((u) => ({ u, rot: rotuloUnidade(u, blocos), p: porUnidade.get(s(u["id"])) }))
    .filter((x) => !termo || `${x.rot} ${s(x.p?.["pessoa_nome"])}`.toLowerCase().includes(termo))
    .sort((x, y) => ordemNatural(x.rot, y.rot));
  const comVoto = presencas.filter((p) => p["direito_voto"]).length;
  const remover = async (p: Row) => {
    if (!(await confirmar({ titulo: "Desfazer check-in?", descricao: "Os votos já registrados desta unidade continuam válidos.", confirmar: "Desfazer", destrutivo: true }))) return;
    const { error } = await db.from("cond_assembleia_presencas").delete().eq("id", s(p["id"]));
    if (error) toast.error(erroMsg(error)); else qc.invalidateQueries({ queryKey: ["cond", "cond_assembleia_presencas"] });
  };
  const fechada = ["finalizada", "cancelada"].includes(s(a["status"]));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Unidades", unidades.length], ["Presentes", presencas.length], ["Com direito a voto", comVoto], ["Só ouvintes", presencas.length - comVoto]].map(([k, v]) => (
          <div key={String(k)} className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="text-2xl font-semibold">{v}</p></div>
        ))}
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input className="pl-8" placeholder="Buscar unidade ou pessoa" aria-label="Buscar unidade ou pessoa" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <ul className="divide-y rounded-lg border bg-card">
        {lista.map(({ u, rot, p }) => (
          <li key={s(u["id"])} className="flex flex-wrap items-center gap-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{rot}</p>
              {p ? <p className="text-xs text-muted-foreground">{s(p["pessoa_nome"]) || "Presente"}{p["is_procurador"] ? " · procurador" : ""} · {p["origem"] === "virtual" ? "online" : "salão"} · {dtHora(p["checkin_at"])}</p>
                : <p className="text-xs text-muted-foreground">Fração ideal {s(u["fracao_ideal"]) || "—"}</p>}
            </div>
            {p && <Badge className={p["direito_voto"] ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"} variant="outline">{p["direito_voto"] ? (p["adimplente"] ? "Adimplente" : "Liberado") : "Inadimplente · ouvinte"}</Badge>}
            {pode && !fechada && (p
              ? <><AcaoIcone titulo="Editar check-in" onClick={() => setCheckin({ ...p, _rot: rot })}><Pencil className="size-4" /></AcaoIcone><AcaoIcone titulo="Desfazer check-in" destrutivo onClick={() => remover(p)}><X className="size-4" /></AcaoIcone></>
              : <Button size="sm" variant="outline" onClick={() => setCheckin({ unidade_id: s(u["id"]), _rot: rot })}><UserCheck className="size-4" /> Check-in</Button>)}
          </li>
        ))}
        {lista.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Nenhuma unidade encontrada.</li>}
      </ul>
      {checkin && <CheckinDialog assembleia={a} dados={checkin} presencas={presencas} onClose={() => setCheckin(null)} onSalvo={() => { setCheckin(null); qc.invalidateQueries({ queryKey: ["cond", "cond_assembleia_presencas"] }); qc.invalidateQueries({ queryKey: ["cond", "assembleia-resultado", id] }); }} />}
    </div>
  );
}

function CheckinDialog({ assembleia: a, dados, presencas, onClose, onSalvo }: { assembleia: Row; dados: Row; presencas: Row[]; onClose: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(s(dados["pessoa_nome"]));
  const [procurador, setProcurador] = useState(dados["is_procurador"] === true);
  const [adimplente, setAdimplente] = useState(dados["adimplente"] !== false);
  const [motivo, setMotivo] = useState(s(dados["liberado_motivo"]));
  const [foto, setFoto] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const limite = Number(a["limite_procuracoes"]) || 0;
  const salvar = async () => {
    if (!nome.trim()) { toast.error("Informe quem está presente."); return; }
    if (procurador && limite > 0) {
      const n = presencas.filter((p) => p["is_procurador"] && s(p["pessoa_nome"]).trim().toLowerCase() === nome.trim().toLowerCase() && s(p["id"]) !== s(dados["id"])).length;
      if (n >= limite) { toast.error(`${nome.trim()} já representa ${n} unidade(s). O limite é ${limite}.`); return; }
    }
    setSalvando(true);
    try {
      let url = s(dados["procuracao_url"]) || null;
      if (procurador && foto) {
        const f = foto.type.startsWith("image/") ? await comprimirImagem(foto, "documento") : foto;
        const path = `${s(dados["unidade_id"])}/assembleia-${s(a["id"])}-${Date.now()}-${f.name.replace(/[^\w.-]/g, "_")}`;
        const up = await supabase.storage.from("cond-documentos").upload(path, f);
        if (up.error) throw up.error;
        url = path;
      }
      const valores = { assembleia_id: s(a["id"]), unidade_id: s(dados["unidade_id"]), pessoa_nome: nome.trim(), is_procurador: procurador, procuracao_url: procurador ? url : null,
        adimplente, liberado_motivo: adimplente ? null : motivo.trim() || null, origem: "presencial" };
      const r = dados["id"] ? await db.from("cond_assembleia_presencas").update(valores).eq("id", s(dados["id"])) : await db.from("cond_assembleia_presencas").insert(valores);
      if (r.error) throw r.error;
      toast.success(adimplente || motivo.trim() ? "Check-in registrado com direito a voto." : "Check-in registrado como ouvinte (sem voto).");
      onSalvo();
    } catch (e) { toast.error(erroMsg(e)); } finally { setSalvando(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
        <DialogHeader><DialogTitle>Check-in · {s(dados["_rot"])}</DialogTitle><DialogDescription>Registre quem chegou e a situação financeira da unidade.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="ck-nome" className="mb-1.5 block">Pessoa presente *</Label><Input id="ck-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus /></div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3"><Label htmlFor="ck-proc">É procurador(a) da unidade</Label><Switch id="ck-proc" checked={procurador} onCheckedChange={setProcurador} /></div>
          {procurador && (
            <div>
              <Label htmlFor="ck-foto" className="mb-1.5 block">Foto da procuração</Label>
              <Input id="ck-foto" ref={arquivo} type="file" accept="image/*,application/pdf" capture="environment" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
              {s(dados["procuracao_url"]) && !foto && <p className="mt-1 text-xs text-muted-foreground">Procuração já anexada.</p>}
              {limite > 0 && <p className="mt-1 text-xs text-muted-foreground">Limite desta assembleia: {limite} procuração(ões) por pessoa.</p>}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div><Label htmlFor="ck-adim">Unidade adimplente</Label><p className="text-xs text-muted-foreground">Inadimplente participa apenas como ouvinte (Art. 1.335, III CC).</p></div>
            <Switch id="ck-adim" checked={adimplente} onCheckedChange={setAdimplente} />
          </div>
          {!adimplente && <div><Label htmlFor="ck-mot" className="mb-1.5 block">Liberar voto mesmo assim? Informe o motivo</Label><Input id="ck-mot" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: apresentou comprovante de pagamento" /><p className="mt-1 text-xs text-muted-foreground">Fica registrado quem liberou, para auditoria.</p></div>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- Telão -------------------------------- */

function Telao({ assembleia: a }: { assembleia: Row }) {
  const { data: res } = useResultado(s(a["id"]), true);
  const ref = useRef<HTMLDivElement>(null);
  const [escolhida, setEscolhida] = useState("");
  const pautas = res?.pautas ?? [];
  const atual = pautas.find((p) => p.id === escolhida) ?? pautas.find((p) => p.status === "em_votacao") ?? [...pautas].reverse().find((p) => p.status === "encerrada") ?? pautas[0];
  const criterio = s(a["criterio_peso"]);
  const ver = atual ? vereditoPauta(atual.quorum, atual.opcoes, res?.total_condominio ?? 0) : null;
  const dados = (atual?.opcoes ?? []).map((o, i) => ({ nome: o.descricao, valor: o.peso, votos: o.votos, cor: COR_OPCAO[o.tipo] ?? CORES[i % CORES.length] }));
  const tela = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void ref.current?.requestFullscreen?.(); };
  const quorumPct = res && res.total_condominio > 0 ? Math.round((res.presentes_peso / res.total_condominio) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[220px] flex-1"><SearchSelect value={escolhida} onChange={setEscolhida} allowClear placeholder="Pauta em votação (automático)" options={pautas.map((p, i) => ({ value: p.id, label: `${i + 1}. ${p.titulo}` }))} /></div>
        <Button variant="outline" onClick={tela}><Maximize2 className="size-4" /> Tela cheia</Button>
      </div>
      <div ref={ref} className="dark flex min-h-[70vh] flex-col gap-6 overflow-auto rounded-lg bg-background p-6 text-foreground md:p-10" aria-live="polite">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-widest text-muted-foreground">{s(a["tipo"])} · {s(a["titulo"])}</p>
            <h2 className="mt-1 text-3xl font-bold md:text-5xl">{atual ? atual.titulo : "Sem pautas"}</h2>
            {atual && <p className="mt-2 text-lg text-muted-foreground">{rotuloQuorum(atual.quorum)} · {atual.status === "em_votacao" ? "votação aberta" : atual.status === "encerrada" ? "votação encerrada" : "aguardando"}</p>}
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><p className="text-4xl font-bold">{res?.presentes ?? 0}</p><p className="text-xs text-muted-foreground">presentes</p></div>
            <div><p className="text-4xl font-bold">{res?.com_voto ?? 0}</p><p className="text-xs text-muted-foreground">com voto</p></div>
            <div><p className="text-4xl font-bold">{quorumPct}%</p><p className="text-xs text-muted-foreground">do condomínio</p></div>
          </div>
        </div>
        <div className="min-h-[320px] flex-1">
          {dados.length ? (
            <ResponsiveContainer width="100%" height="100%" minHeight={320}>
              <BarChart data={dados} layout="vertical" margin={{ left: 20, right: 80 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="nome" width={140} tick={{ fill: "var(--foreground)", fontSize: 22, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <Bar dataKey="valor" radius={[0, 8, 8, 0]} isAnimationActive>
                  {dados.map((d) => <Cell key={d.nome} fill={d.cor} />)}
                  <LabelList dataKey="votos" position="right" formatter={(v: unknown) => `${String(v)} voto(s)`} style={{ fill: "var(--foreground)", fontSize: 20, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="pt-20 text-center text-xl text-muted-foreground">Cadastre pautas para exibir o resultado.</p>}
        </div>
        {ver && atual?.status === "encerrada" && (
          <p className={cn("rounded-lg p-4 text-center text-3xl font-bold", ver.situacao === "aprovada" ? "bg-success/20 text-success" : ver.situacao === "reprovada" ? "bg-destructive/20 text-destructive" : "bg-muted")}>{ver.texto}</p>
        )}
        <p className="text-center text-xs text-muted-foreground">Peso do voto: {CRITERIOS.find((c) => c.value === criterio)?.label} · atualiza em tempo real</p>
      </div>
    </div>
  );
}

/* --------------------------------- Ata --------------------------------- */

function montarAta(a: Row, res: Resultado, presencas: Row[], unidades: Row[], blocos: Row[], cond: string): string {
  const criterio = s(a["criterio_peso"]);
  const presentes = presencas.map((p) => { const u = unidades.find((x) => s(x["id"]) === s(p["unidade_id"])); return `${u ? rotuloUnidade(u, blocos) : "Unidade"} — ${s(p["pessoa_nome"])}${p["is_procurador"] ? " (procurador)" : ""}${p["direito_voto"] ? "" : " (ouvinte)"}`; }).sort(ordemNatural);
  const itens = res.pautas.map((p, i) => {
    const v = vereditoPauta(p.quorum, p.opcoes, res.total_condominio);
    const votos = p.opcoes.map((o) => `${o.descricao}: ${o.votos} voto(s), peso ${fmtPeso(o.peso, criterio)}`).join("; ");
    return `<p><strong>${i + 1}. ${p.titulo}</strong> (${rotuloQuorum(p.quorum)}) — ${votos}. <strong>Resultado: ${v.texto}.</strong></p>`;
  }).join("");
  return `<p><strong>ATA DA ASSEMBLEIA GERAL ${s(a["tipo"]) === "AGO" ? "ORDINÁRIA" : "EXTRAORDINÁRIA"} — ${cond.toUpperCase()}</strong></p>
<p>Aos ${a["aberta_em"] ? new Date(s(a["aberta_em"])).toLocaleString("pt-BR") : dtHora(a["data_hora"])}, em ${s(a["local"]) || "local indicado no edital"}${s(a["formato"]) !== "presencial" ? " e por videoconferência" : ""}, reuniram-se os condôminos em ${s(a["tipo"])}, convocada para ${dtHora(a["data_hora"])} em 1ª convocação e ${dtHora(a["data_hora_2a"])} em 2ª convocação. Presidiu os trabalhos ${s(a["presidente"]) || "________"}, secretariado(a) por ${s(a["secretario"]) || "________"}.</p>
<p>Compareceram ${res.presentes} de ${res.unidades_total} unidades (${res.com_voto} com direito a voto), conforme lista de presença. Peso do voto: ${CRITERIOS.find((c) => c.value === criterio)?.label}.</p>
<p><strong>Deliberações:</strong></p>${itens}
<p>Nada mais havendo a tratar, o(a) presidente encerrou a assembleia, e eu, secretário(a), lavrei a presente ata, que vai assinada por mim e pelo(a) presidente.</p>
<p><strong>Lista de presença:</strong><br>${presentes.join("<br>") || "—"}</p>
<p><br>_______________________________<br>${s(a["presidente"]) || "Presidente"}<br><br>_______________________________<br>${s(a["secretario"]) || "Secretário(a)"}</p>`;
}

function Ata({ assembleia: a, unidades, blocos, pode, onAtualizar }: { assembleia: Row; unidades: Row[]; blocos: Row[]; pode: boolean; onAtualizar: () => void }) {
  const id = s(a["id"]);
  const emp = useEmpresaAtiva();
  const { data: res } = useResultado(id);
  const { data: presencas = [] } = useCondRows("cond_assembleia_presencas", "assembleia_id", id);
  const { data: votos = [] } = useCondRows("cond_assembleia_votos", "assembleia_id", id);
  const { data: pautas = [] } = useCondRows("cond_assembleia_pautas", "assembleia_id", id, "ordem");
  const { data: opcoes = [] } = useQuery({
    queryKey: ["cond", "cond_assembleia_opcoes_voto", "assembleia", id, pautas.length],
    enabled: pautas.length > 0,
    queryFn: async (): Promise<Row[]> => { const { data } = await db.from("cond_assembleia_opcoes_voto").select("*").in("pauta_id", pautas.map((p) => s(p["id"]))); return (data ?? []) as Row[]; },
  });
  const [html, setHtml] = useState(s(a["ata_html"]));
  const [salvando, setSalvando] = useState(false);
  const cond = String(emp.nome ?? "");
  const gerar = async () => {
    if (!res) return;
    if (html.trim() && !(await confirmar({ titulo: "Gerar a ata de novo?", descricao: "O texto atual será substituído pela minuta com os resultados.", confirmar: "Gerar" }))) return;
    setHtml(montarAta(a, res, presencas, unidades, blocos, cond));
  };
  const salvar = async () => {
    setSalvando(true);
    const { error } = await db.from("cond_assembleias").update({ ata_html: html, updated_at: new Date().toISOString() }).eq("id", id);
    setSalvando(false);
    if (error) toast.error(erroMsg(error)); else { toast.success("Ata salva."); onAtualizar(); }
  };
  const nomeU = (uid: unknown) => { const u = unidades.find((x) => s(x["id"]) === s(uid)); return u ? rotuloUnidade(u, blocos) : "—"; };
  const trilha = [...votos].sort((x, y) => s(x["created_at"]).localeCompare(s(y["created_at"])));
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex-1 text-sm font-semibold">Ata</h3>
          {pode && <Button variant="outline" onClick={gerar} disabled={!res}><FileSignature className="size-4" /> Gerar minuta com os resultados</Button>}
          <Button variant="outline" onClick={() => imprimirElemento("assembleia-ata-print")} disabled={!html.trim()}><Printer className="size-4" /> Imprimir ata</Button>
          {pode && <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar ata"}</Button>}
        </div>
        {s(a["status"]) !== "finalizada" && <p className="text-xs text-muted-foreground">Dica: finalize a assembleia antes de gerar a ata definitiva.</p>}
        <TextoRico value={html} onChange={setHtml} minHeight={320} disabled={!pode} placeholder="Clique em “Gerar minuta” para montar a ata com os votos e a lista de presença." />
      </section>
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex flex-1 items-center gap-1 text-sm font-semibold"><ShieldCheck className="size-4 text-success" aria-hidden /> Trilha de auditoria dos votos ({trilha.length})</h3>
          <Button variant="outline" onClick={() => imprimirElemento("assembleia-auditoria-print")} disabled={!trilha.length}><Printer className="size-4" /> Imprimir trilha</Button>
        </div>
        <p className="text-xs text-muted-foreground">Cada voto guarda horário exato, IP, navegador e um código (hash) encadeado ao voto anterior: qualquer alteração no banco quebra a sequência.</p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-left"><tr><th className="p-2">Horário</th><th className="p-2">Pauta</th><th className="p-2">Unidade</th><th className="p-2">Voto</th><th className="p-2">Peso</th><th className="p-2">Origem</th><th className="p-2">IP</th><th className="p-2">Hash</th></tr></thead>
            <tbody>
              {trilha.map((v) => (
                <tr key={s(v["id"])} className="border-t">
                  <td className="whitespace-nowrap p-2">{new Date(s(v["created_at"])).toLocaleString("pt-BR")}</td>
                  <td className="p-2">{s(pautas.find((p) => s(p["id"]) === s(v["pauta_id"]))?.["titulo"])}</td>
                  <td className="whitespace-nowrap p-2">{nomeU(v["unidade_id"])}</td>
                  <td className="p-2">{s(opcoes.find((o) => s(o["id"]) === s(v["opcao_id"]))?.["descricao"])}</td>
                  <td className="p-2">{fmtPeso(Number(v["peso_fracao"]), s(a["criterio_peso"]))}</td>
                  <td className="p-2">{v["origem"] === "mesa" ? "Mesa" : "App"}</td>
                  <td className="p-2">{s(v["ip"]) || "—"}</td>
                  <td className="p-2 font-mono" title={s(v["hash_auditoria"])}>{s(v["hash_auditoria"]).slice(0, 12)}…</td>
                </tr>
              ))}
              {!trilha.length && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Nenhum voto registrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <div className="dre-print-src" aria-hidden>
        <div id="assembleia-ata-print" className="dre-doc">
          <CabecalhoDoc titulo="Ata da assembleia" sub={`${s(a["tipo"])} · ${s(a["titulo"])}`} />
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
        <div id="assembleia-auditoria-print" className="dre-doc">
          <CabecalhoDoc titulo="Trilha de auditoria dos votos" sub={`${s(a["tipo"])} · ${s(a["titulo"])}`} />
          <table className="dre-kpis"><tbody><tr>
            <td><span>Presentes</span><strong>{res?.presentes ?? 0}</strong></td>
            <td><span>Com voto</span><strong>{res?.com_voto ?? 0}</strong></td>
            <td><span>Pautas</span><strong>{pautas.length}</strong></td>
            <td><span>Votos</span><strong>{trilha.length}</strong></td>
          </tr></tbody></table>
          <table className="dre-tab"><thead><tr><th>Horário</th><th>Pauta</th><th>Unidade</th><th>Voto</th><th>Peso</th><th>IP</th><th>Hash SHA-256</th></tr></thead>
            <tbody>{trilha.map((v) => <tr key={s(v["id"])}><td>{new Date(s(v["created_at"])).toLocaleString("pt-BR")}</td><td>{s(pautas.find((p) => s(p["id"]) === s(v["pauta_id"]))?.["titulo"])}</td><td>{nomeU(v["unidade_id"])}</td><td>{s(opcoes.find((o) => s(o["id"]) === s(v["opcao_id"]))?.["descricao"])}</td><td>{fmtPeso(Number(v["peso_fracao"]), s(a["criterio_peso"]))}</td><td>{s(v["ip"]) || "—"}</td><td style={{ fontFamily: "monospace", fontSize: 8, wordBreak: "break-all" }}>{s(v["hash_auditoria"])}</td></tr>)}</tbody></table>
          <footer className="dre-rodape">Votos imutáveis com hash encadeado. Documento de uso interno.</footer>
        </div>
      </div>
    </div>
  );
}

function CabecalhoDoc({ titulo, sub }: { titulo: string; sub: string }) {
  const emp = useEmpresaAtiva();
  return (
    <>
      <header className="dre-head">
        <div className="dre-emp">
          {emp.logo && <img src={String(emp.logo)} alt="" data-no-zoom />}
          <div><div className="dre-emp-nome">{emp.nome}</div><div className="dre-rot">Documento • Confidencial</div></div>
        </div>
        <div className="dre-head-dir"><div className="dre-rot">Emitido em</div><div>{new Date().toLocaleString("pt-BR")}</div></div>
      </header>
      <div className="dre-titulo"><h1>{titulo}</h1><p>{sub}</p></div>
    </>
  );
}

/* ------------------------- Participação (morador) ------------------------- */

type Minha = {
  id: string; titulo: string; tipo: string; formato: string; data_hora: string | null; data_hora_2a: string | null; local: string | null; link_video: string | null;
  edital: string | null; status: string; sessao_ate: string | null;
  unidades: { id: string; numero: string; presente: boolean; direito_voto: boolean }[];
  pautas: { id: string; ordem: number; titulo: string; descricao: string | null; quorum: string; status: string; opcoes: { id: string; descricao: string; tipo: string }[]; meus_votos: { unidade_id: string; opcao_id: string; hash: string }[] }[];
};

/** Assembleias para o condômino: convocação, link da sala, check-in online e voto. */
export function AssembleiasMorador({ condominioId }: { condominioId: string }) {
  const qc = useQueryClient();
  const chave = ["cond", "assembleias-minhas", condominioId];
  const { data = [], isLoading } = useQuery({
    queryKey: chave, enabled: !!condominioId, refetchInterval: 20_000,
    queryFn: async (): Promise<Minha[]> => { const { data, error } = await db.rpc("cond_assembleias_minhas", { p_condominio: condominioId }); if (error) throw error; return (data ?? []) as Minha[]; },
  });
  const [ocupado, setOcupado] = useState("");
  const recarregar = () => qc.invalidateQueries({ queryKey: chave });
  const checkin = async (a: Minha) => {
    setOcupado(a.id);
    const { error } = await db.rpc("cond_assembleia_checkin", { p_assembleia: a.id });
    setOcupado("");
    if (error) toast.error(erroMsg(error)); else { toast.success("Presença confirmada."); recarregar(); }
  };
  const votar = async (pautaId: string, opcaoId: string, unidadeId: string, rotulo: string) => {
    if (!(await confirmar({ titulo: "Confirmar voto?", descricao: `Seu voto: ${rotulo}. Depois de confirmado não pode ser alterado.`, confirmar: "Votar" }))) return;
    setOcupado(pautaId + unidadeId);
    const { error } = await db.rpc("cond_assembleia_votar", { p_pauta: pautaId, p_opcao: opcaoId, p_unidade: unidadeId, p_user_agent: navigator.userAgent });
    setOcupado("");
    if (error) toast.error(erroMsg(error)); else { toast.success("Voto registrado com segurança."); recarregar(); }
  };
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando assembleias…</p>;
  if (!data.length) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"><Gavel className="mx-auto mb-2 size-7 opacity-60" aria-hidden />Nenhuma assembleia convocada para você no momento.</div>;
  return (
    <div className="space-y-3">
      {data.map((a) => {
        const sessao = emSessao(a.status);
        const presente = a.unidades.some((u) => u.presente);
        return (
          <article key={a.id} className="space-y-3 rounded-lg border bg-card p-4">
            <header className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{a.tipo}</Badge><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", COR_STATUS[a.status])}>{rotuloStatus(a.status)}</span></div>
                <h3 className="mt-1 font-semibold">{a.titulo}</h3>
                <p className="text-xs text-muted-foreground">1ª {dtHora(a.data_hora)} · 2ª {dtHora(a.data_hora_2a)}{a.local ? ` · ${a.local}` : ""}{a.status === "sessao_permanente" && a.sessao_ate ? ` · votação até ${dtHora(a.sessao_ate)}` : ""}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {a.link_video && a.status !== "finalizada" && <Button variant="outline" asChild><a href={a.link_video} target="_blank" rel="noreferrer"><Video className="size-4" /> Entrar na sala</a></Button>}
                {sessao && a.formato !== "presencial" && !presente && <Button onClick={() => checkin(a)} disabled={ocupado === a.id}><UserCheck className="size-4" /> Confirmar presença</Button>}
                {presente && <Badge className="bg-success/15 text-success" variant="outline"><CheckCircle2 className="mr-1 size-3" /> Presença confirmada</Badge>}
              </div>
            </header>
            {a.edital && !sessao && <details className="text-sm"><summary className="cursor-pointer text-primary">Ler edital de convocação</summary><div className="prose prose-sm mt-2 max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: a.edital }} /></details>}
            <ol className="space-y-2">
              {a.pautas.map((p, i) => (
                <li key={p.id} className={cn("rounded-md border p-3", p.status === "em_votacao" && "border-success/60")}>
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{i + 1}. {p.titulo}</span>
                    <Badge variant="outline">{p.status === "em_votacao" ? "Em votação" : p.status === "encerrada" ? "Encerrada" : "Aguardando"}</Badge></div>
                  {p.descricao && <details className="mt-1 text-sm"><summary className="cursor-pointer text-xs text-primary">Ver detalhes</summary><div className="prose prose-sm mt-1 max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: p.descricao }} /></details>}
                  {p.status === "em_votacao" && sessao && a.unidades.map((u) => {
                    const meu = p.meus_votos.find((v) => v.unidade_id === u.id);
                    return (
                      <div key={u.id} className="mt-2 space-y-1">
                        {a.unidades.length > 1 && <p className="text-xs font-medium text-muted-foreground">Unidade {u.numero}</p>}
                        {meu ? <p className="text-sm text-success"><CheckCircle2 className="mr-1 inline size-4" />Votou: {p.opcoes.find((o) => o.id === meu.opcao_id)?.descricao} · comprovante <span className="font-mono text-xs">{meu.hash.slice(0, 12)}</span></p>
                          : !u.presente ? <p className="text-xs text-muted-foreground">{a.formato === "presencial" ? "Faça o check-in na recepção para votar." : "Confirme a presença para votar."}</p>
                          : !u.direito_voto ? <p className="text-xs text-destructive">Unidade com pendência financeira: participação como ouvinte.</p>
                          : <div role="group" aria-label={`Votar: ${p.titulo}`} className="flex flex-wrap gap-2">{p.opcoes.map((o) => (
                              <Button key={o.id} size="sm" variant={o.tipo === "sim" ? "default" : o.tipo === "nao" ? "destructive" : "outline"} disabled={ocupado === p.id + u.id} onClick={() => votar(p.id, o.id, u.id, o.descricao)}>{o.descricao}</Button>))}</div>}
                      </div>
                    );
                  })}
                </li>
              ))}
            </ol>
          </article>
        );
      })}
    </div>
  );
}
