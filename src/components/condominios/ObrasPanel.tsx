import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, Camera, Check, CheckCircle2, Clock, Eye, EyeOff, HardHat, Hammer, Loader2, Lock, Megaphone, Pencil, Plus, Search, Trash2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { uploadAnexo } from "@/lib/manutencoes";
import { formatBRL } from "@/lib/orcamentos";
import {
  MOMENTOS_FOTO, STATUS_ATIVIDADE, STATUS_OBRA, custoRealizado, estadosFases, paraMorador, percAtividade, percFase, percObra, prazoObra, rotulo,
  type AtividadeObra, type FaseObra, type FotoObra, type Obra, type Prazo,
} from "@/lib/obras";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { AcaoIcone } from "./AcaoIcone";
import { CampoData } from "./CampoData";
import { s } from "./cond-data";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
type Perms = { canCreate: boolean; canUpdate: boolean; canDelete: boolean };
const n = (v: unknown) => (v == null || v === "" ? null : Number(v));
const dt = (v: string) => (v ? new Date(`${v}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const periodo = (a: string, b: string) => (a || b ? `${dt(a)} a ${dt(b)}` : "Sem datas");
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const moedaParaNum = (t: string) => { const x = t.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."); return x ? Number(x) : null; };
const numParaMoeda = (v: number | null) => (v == null ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const PRAZO_VIS: Record<Prazo, { label: (d: number) => string; cls: string; Icon: typeof Clock }> = {
  no_prazo: { label: () => "No prazo", cls: "border-success/40 bg-success/10 text-success", Icon: CheckCircle2 },
  atencao: { label: (d) => `Atenção · ${d} ${d === 1 ? "dia" : "dias"} p/ terminar`, cls: "border-warning/60 bg-warning/15 text-warning", Icon: AlertTriangle },
  atrasada: { label: (d) => `Atrasada ${d} ${d === 1 ? "dia" : "dias"}`, cls: "border-destructive/50 bg-destructive/10 text-destructive", Icon: AlertTriangle },
  concluida: { label: () => "Concluída", cls: "border-success/40 bg-success/10 text-success", Icon: CheckCircle2 },
  sem_prazo: { label: () => "Sem prazo definido", cls: "border-border bg-muted text-muted-foreground", Icon: Clock },
};

/** Monta a árvore obra → fases → atividades a partir das tabelas. */
function montar(obras: Row[], fases: Row[], ats: Row[], fotos: Row[]): Obra[] {
  const atv = (a: Row): AtividadeObra => ({ id: s(a["id"]), fase_id: s(a["fase_id"]), descricao: s(a["descricao"]), status: s(a["status"]) || "pendente", responsavel: s(a["responsavel"]), data_inicio: s(a["data_inicio"]), data_fim: s(a["data_fim"]), percentual: Number(a["percentual"] ?? 0), custo: n(a["custo"]), ordem: Number(a["ordem"] ?? 0) });
  return obras.map((o) => ({
    id: s(o["id"]), titulo: s(o["titulo"]), observacao: s(o["observacao"]), aviso: s(o["aviso"]), status: s(o["status"]) || "planejada",
    data_inicio: s(o["data_inicio"]), data_fim: s(o["data_fim"]), custo_previsto: n(o["custo_previsto"]),
    visivel_moradores: o["visivel_moradores"] === true, mostrar_custo: o["mostrar_custo"] === true,
    fases: fases.filter((f) => s(f["obra_id"]) === s(o["id"])).sort((a, b) => Number(a["ordem"]) - Number(b["ordem"])).map((f): FaseObra => ({
      id: s(f["id"]), obra_id: s(f["obra_id"]), nome: s(f["nome"]), ordem: Number(f["ordem"] ?? 0), data_inicio: s(f["data_inicio"]), data_fim: s(f["data_fim"]),
      atividades: ats.filter((a) => s(a["fase_id"]) === s(f["id"])).map(atv).sort((a, b) => a.ordem - b.ordem),
    })),
    fotos: fotos.filter((p) => s(p["obra_id"]) === s(o["id"])).map((p): FotoObra => ({ id: s(p["id"]), obra_id: s(p["obra_id"]), url: s(p["url"]), legenda: s(p["legenda"]), momento: s(p["momento"]) || "durante", created_at: s(p["created_at"]) })),
  }));
}

/** Obras do condomínio: gestão completa e visão simplificada para moradores. */
export function ObrasPanel({ condominioId, perms }: { condominioId: string; perms: Perms }) {
  const gestor = perms.canCreate || perms.canUpdate;
  return gestor ? (
    <Tabs defaultValue="gestao" className="space-y-3">
      <TabsList>
        <TabsTrigger value="gestao">Gestão</TabsTrigger>
        <TabsTrigger value="morador">Como o morador vê</TabsTrigger>
      </TabsList>
      <TabsContent value="gestao"><Gestao condominioId={condominioId} perms={perms} /></TabsContent>
      <TabsContent value="morador"><VisaoMorador condominioId={condominioId} /></TabsContent>
    </Tabs>
  ) : <VisaoMorador condominioId={condominioId} />;
}

function useObrasGestao(condominioId: string) {
  return useQuery({
    queryKey: ["cond", "obras", condominioId],
    queryFn: async (): Promise<Obra[] | "sem_script"> => {
      const [o, f, a, p] = await Promise.all(["cond_obras", "cond_obras_fases", "cond_obras_atividades", "cond_obras_fotos"].map((t) => db.from(t).select("*").eq("condominio_id", condominioId)));
      const erro = [o, f, a, p].find((r) => r.error)?.error;
      if (erro) { if (/does not exist|schema cache|42P01|PGRST205/i.test(`${erro.message} ${erro.code}`)) return "sem_script"; throw erro; }
      return montar(o.data ?? [], f.data ?? [], a.data ?? [], p.data ?? []).sort((x, y) => (y.data_inicio || "").localeCompare(x.data_inicio || ""));
    },
  });
}

function Gestao({ condominioId, perms }: { condominioId: string; perms: Perms }) {
  const q = useObrasGestao(condominioId);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [editar, setEditar] = useState<Obra | "nova" | null>(null);
  const hoje = new Date();
  if (q.data === "sem_script") return <SemScript />;
  const obras = q.data ?? [];
  const filtradas = obras.filter((o) => (!status || o.status === status) && (!busca.trim() || norm(`${o.titulo} ${o.observacao}`).includes(norm(busca.trim()))));
  const ativas = obras.filter((o) => o.status === "andamento");
  const atrasadas = obras.filter((o) => prazoObra(o, hoje).prazo === "atrasada").length;
  const investido = obras.reduce((t, o) => t + custoRealizado(o), 0);
  const aberta = obras.find((o) => o.id === abertaId) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi Icon={HardHat} rotulo="Obras cadastradas" valor={String(obras.length)} />
        <Kpi Icon={Hammer} rotulo="Em andamento" valor={String(ativas.length)} />
        <Kpi Icon={AlertTriangle} rotulo="Atrasadas" valor={String(atrasadas)} alerta={atrasadas > 0} />
        <Kpi Icon={Wallet} rotulo="Total investido" valor={formatBRL(investido)} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input aria-label="Buscar obra" placeholder="Buscar obra…" className="pl-8" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="w-52"><SearchSelect value={status} onChange={setStatus} placeholder="Todas as situações" options={[{ value: "", label: "Todas as situações" }, ...STATUS_OBRA]} /></div>
        {perms.canCreate && <Button onClick={() => setEditar("nova")}><Plus className="size-4" /> Nova obra</Button>}
      </div>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Carregando obras…</p>
        : filtradas.length === 0 ? <Vazio texto={obras.length ? "Nenhuma obra encontrada com esses filtros." : "Nenhuma obra cadastrada. Crie a primeira e divida em fases."} />
        : <div className="grid gap-3 lg:grid-cols-2">{filtradas.map((o) => <CartaoObra key={o.id} obra={o} gestor onAbrir={() => setAbertaId(o.id)} />)}</div>}
      {aberta && <DetalheObra obra={aberta} condominioId={condominioId} perms={perms} onClose={() => setAbertaId(null)} onEditar={() => setEditar(aberta)} />}
      {editar && <ObraDialog condominioId={condominioId} obra={editar === "nova" ? null : editar} onClose={() => setEditar(null)} onCriada={(id) => setAbertaId(id)} />}
    </div>
  );
}

function VisaoMorador({ condominioId }: { condominioId: string }) {
  const q = useQuery({
    queryKey: ["cond", "obras", "morador", condominioId],
    queryFn: async (): Promise<Obra[] | "sem_script"> => {
      const r = await db.rpc("cond_obras_moradores", { p_condominio: condominioId });
      if (r.error) { if (/does not exist|schema cache|PGRST202/i.test(`${r.error.message} ${r.error.code}`)) return "sem_script"; throw r.error; }
      const lista = (r.data ?? []) as Row[];
      return paraMorador(lista.map((o) => ({
        id: s(o["id"]), titulo: s(o["titulo"]), observacao: s(o["observacao"]), aviso: s(o["aviso"]), status: s(o["status"]),
        data_inicio: s(o["data_inicio"]), data_fim: s(o["data_fim"]), custo_previsto: n(o["custo_previsto"]),
        visivel_moradores: true, mostrar_custo: o["mostrar_custo"] === true,
        fases: ((o["fases"] ?? []) as Row[]).map((f) => ({ id: s(f["id"]), obra_id: s(f["obra_id"]), nome: s(f["nome"]), ordem: Number(f["ordem"] ?? 0), data_inicio: s(f["data_inicio"]), data_fim: s(f["data_fim"]),
          atividades: ((f["atividades"] ?? []) as Row[]).map((a) => ({ id: s(a["id"]), fase_id: s(a["fase_id"]), descricao: s(a["descricao"]), status: s(a["status"]), responsavel: s(a["responsavel"]), data_inicio: s(a["data_inicio"]), data_fim: s(a["data_fim"]), percentual: Number(a["percentual"] ?? 0), custo: n(a["custo"]), ordem: Number(a["ordem"] ?? 0) })) })),
        fotos: ((o["fotos"] ?? []) as Row[]).map((p) => ({ id: s(p["id"]), obra_id: s(p["obra_id"]), url: s(p["url"]), legenda: s(p["legenda"]), momento: s(p["momento"]), created_at: s(p["created_at"]) })),
      })));
    },
  });
  const [abertaId, setAbertaId] = useState<string | null>(null);
  if (q.data === "sem_script") return <SemScript />;
  const obras = q.data ?? [];
  const aberta = obras.find((o) => o.id === abertaId) ?? null;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Acompanhe as obras do condomínio: em que etapa cada uma está, o prazo e as fotos da evolução.</p>
      {q.isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p>
        : obras.length === 0 ? <Vazio texto="Nenhuma obra divulgada para os moradores no momento." />
        : <div className="grid gap-3 lg:grid-cols-2">{obras.map((o) => <CartaoObra key={o.id} obra={o} onAbrir={() => setAbertaId(o.id)} />)}</div>}
      {aberta && <DetalheObra obra={aberta} condominioId={condominioId} onClose={() => setAbertaId(null)} />}
    </div>
  );
}

/* ----------------------------- Peças visuais ----------------------------- */

function Kpi({ Icon, rotulo: r, valor, alerta }: { Icon: typeof Clock; rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-lg border bg-card p-3", alerta && "border-destructive/50")}>
      <span className={cn("flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary", alerta && "bg-destructive/10 text-destructive")}><Icon className="size-4" aria-hidden /></span>
      <div><p className="text-xs text-muted-foreground">{r}</p><p className="text-lg font-semibold">{valor}</p></div>
    </div>
  );
}
const Vazio = ({ texto }: { texto: string }) => <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{texto}</div>;
const SemScript = () => <Vazio texto="Rode o script de Gestão de Obras no banco de dados para liberar esta área." />;

function SeloPrazo({ obra }: { obra: Obra }) {
  const { prazo, dias } = prazoObra(obra, new Date());
  const v = PRAZO_VIS[prazo];
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", v.cls)}><v.Icon className="size-3.5" aria-hidden />{v.label(dias)}</span>;
}

/** Régua de fases: concluída (check), atual (destaque com %), futura (tracejada). */
function ReguaFases({ fases, compacta }: { fases: FaseObra[]; compacta?: boolean }) {
  if (!fases.length) return <p className="text-xs text-muted-foreground">Fases ainda não definidas.</p>;
  const est = estadosFases(fases);
  return (
    <ol className="flex flex-wrap items-center gap-y-2" aria-label="Etapas da obra">
      {fases.map((f, i) => {
        const e = est[i]!;
        const p = percFase(f);
        return (
          <li key={f.id} className="flex items-center" aria-current={e === "atual" ? "step" : undefined}>
            {i > 0 && <span aria-hidden className={cn("mx-1 h-0.5 w-4 sm:w-6", e === "futura" ? "border-t-2 border-dashed border-muted-foreground/40" : "bg-primary")} />}
            <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
              e === "concluida" && "border-success/40 bg-success/10 text-success",
              e === "atual" && "border-primary bg-primary text-primary-foreground",
              e === "futura" && "border-dashed text-muted-foreground")}>
              {e === "concluida" ? <Check className="size-3.5" aria-hidden /> : e === "atual" ? <Hammer className="size-3.5" aria-hidden /> : <span className="text-[10px]">{i + 1}</span>}
              <span className={cn(compacta && "max-w-28 truncate")}>{f.nome}</span>
              {e === "atual" && <span>({pct(p)})</span>}
              <span className="sr-only">{e === "concluida" ? "— concluída" : e === "atual" ? "— etapa atual" : "— ainda vai começar"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function BarraCusto({ obra }: { obra: Obra }) {
  const real = custoRealizado(obra);
  const prev = obra.custo_previsto ?? 0;
  const uso = prev > 0 ? Math.round((real / prev) * 100) : 0;
  return (
    <div className="space-y-1">
      <p className="text-sm"><Wallet className="mr-1 inline size-4 text-muted-foreground" aria-hidden />
        Investimento: <strong>{formatBRL(real)}</strong>{prev > 0 && <> de {formatBRL(prev)} previstos <span className={cn("text-muted-foreground", uso > 100 && "font-medium text-destructive")}>({uso}% usado{uso > 100 ? " — acima do previsto" : ""})</span></>}</p>
      {prev > 0 && <Progress value={Math.min(uso, 100)} aria-label={`Orçamento usado: ${uso}%`} className={cn("h-1.5", uso > 100 && "bg-destructive/20")} />}
    </div>
  );
}

function CartaoObra({ obra, gestor, onAbrir }: { obra: Obra; gestor?: boolean; onAbrir: () => void }) {
  const p = percObra(obra);
  const verCusto = gestor || obra.mostrar_custo;
  return (
    <button type="button" onClick={onAbrir} aria-label={`Abrir obra ${obra.titulo}, ${pct(p)} concluída`}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex flex-wrap items-start gap-2">
        <HardHat className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">{obra.titulo}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3.5" aria-hidden />{periodo(obra.data_inicio, obra.data_fim)}</p>
        </div>
        <Badge variant="outline">{rotulo(STATUS_OBRA, obra.status)}</Badge>
        <SeloPrazo obra={obra} />
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs"><span className="text-muted-foreground">Andamento geral</span><strong>{pct(p)}</strong></div>
        <Progress value={p} aria-hidden className="h-2.5" />
      </div>
      <ReguaFases fases={obra.fases} compacta />
      {verCusto && <BarraCusto obra={obra} />}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {obra.fotos.length > 0 && (
          <span className="flex items-center gap-1">
            {obra.fotos.slice(-3).map((f) => <img key={f.id} src={f.url} alt="" className="size-8 rounded object-cover" />)}
            <Camera className="ml-1 size-3.5" aria-hidden />{obra.fotos.length} {obra.fotos.length === 1 ? "foto" : "fotos"}
          </span>
        )}
        {obra.aviso && <span className="flex items-center gap-1 text-warning"><Megaphone className="size-3.5" aria-hidden />Tem recado</span>}
        {gestor && <span className="ml-auto flex items-center gap-2">
          {obra.visivel_moradores ? <span className="flex items-center gap-1"><Eye className="size-3.5" aria-hidden />Moradores veem</span> : <span className="flex items-center gap-1"><EyeOff className="size-3.5" aria-hidden />Só gestão</span>}
          {obra.visivel_moradores && !obra.mostrar_custo && <span className="flex items-center gap-1"><Lock className="size-3.5" aria-hidden />Custo oculto</span>}
        </span>}
      </div>
    </button>
  );
}

/* ----------------------------- Detalhe ----------------------------- */

function DetalheObra({ obra, condominioId, perms, onClose, onEditar }: { obra: Obra; condominioId: string; perms?: Perms; onClose: () => void; onEditar?: () => void }) {
  const qc = useQueryClient();
  const editar = !!perms?.canUpdate;
  const verCusto = !!perms || obra.mostrar_custo;
  const [fase, setFase] = useState<FaseObra | "nova" | null>(null);
  const [atv, setAtv] = useState<{ fase: FaseObra; atividade: AtividadeObra | null } | null>(null);
  const [foto, setFoto] = useState<FotoObra | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [momento, setMomento] = useState("durante");
  const arquivo = useRef<HTMLInputElement>(null);
  const recarregar = () => qc.invalidateQueries({ queryKey: ["cond", "obras"] });
  const est = estadosFases(obra.fases);

  const excluir = async (tabela: string, id: string, oque: string) => {
    if (!(await confirmar({ title: `Excluir ${oque}?`, description: "Esta ação não pode ser desfeita.", destructive: true }))) return;
    const r = await db.from(tabela).delete().eq("id", id);
    if (r.error) return void toast.error(r.error.message);
    toast.success("Excluído."); void recarregar();
    if (tabela === "cond_obras") onClose();
  };
  const enviarFotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setEnviando(true);
    try {
      for (const f of Array.from(files)) {
        const url = await uploadAnexo(f);
        const r = await db.from("cond_obras_fotos").insert({ obra_id: obra.id, condominio_id: condominioId, url, momento });
        if (r.error) throw r.error;
      }
      toast.success("Fotos adicionadas."); void recarregar();
    } catch (e) { toast.error((e as Error).message || "Não foi possível enviar."); }
    finally { setEnviando(false); if (arquivo.current) arquivo.current.value = ""; }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="z-[90] flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-none lg:w-[60vw]">
        <SheetHeader className="border-b p-5 text-left">
          <div className="flex flex-wrap items-start gap-2 pr-8">
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-xl">{obra.titulo}</SheetTitle>
              <SheetDescription>{periodo(obra.data_inicio, obra.data_fim)} · {rotulo(STATUS_OBRA, obra.status)}</SheetDescription>
            </div>
            <SeloPrazo obra={obra} />
            {editar && onEditar && <AcaoIcone titulo="Editar obra" onClick={onEditar}><Pencil className="size-4" /></AcaoIcone>}
            {perms?.canDelete && <AcaoIcone titulo="Excluir obra" destrutivo onClick={() => excluir("cond_obras", obra.id, "a obra e todas as fases")}><Trash2 className="size-4" /></AcaoIcone>}
          </div>
        </SheetHeader>
        <div className="space-y-6 p-5">
          <section className="space-y-3" aria-label="Resumo">
            <div className="space-y-1">
              <div className="flex justify-between text-sm"><span>Andamento geral</span><strong>{pct(percObra(obra))}</strong></div>
              <Progress value={percObra(obra)} aria-label={`Andamento geral ${pct(percObra(obra))}`} className="h-3" />
            </div>
            <ReguaFases fases={obra.fases} />
            {verCusto && <BarraCusto obra={obra} />}
            {obra.observacao && <p className="text-sm text-muted-foreground">{obra.observacao}</p>}
            {obra.aviso && <div role="note" className="flex gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm"><Megaphone className="size-4 shrink-0 text-warning" aria-hidden /><span>{obra.aviso}</span></div>}
          </section>

          <section className="space-y-3" aria-labelledby="t-fases">
            <div className="flex items-center gap-2">
              <h3 id="t-fases" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Fases e atividades</h3>
              {editar && <Button size="sm" variant="outline" className="ml-auto" onClick={() => setFase("nova")}><Plus className="size-4" /> Nova fase</Button>}
            </div>
            {obra.fases.length === 0 && <Vazio texto={editar ? "Divida a obra em fases (ex.: Cotação, Contratação, Execução, Vistoria)." : "Fases ainda não definidas."} />}
            {obra.fases.map((f, i) => (
              <details key={f.id} open={est[i] === "atual"} className="group rounded-lg border bg-card">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className={cn("flex size-7 items-center justify-center rounded-full text-xs font-bold",
                    est[i] === "concluida" ? "bg-success/15 text-success" : est[i] === "atual" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                    {est[i] === "concluida" ? <Check className="size-4" aria-label="Concluída" /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{f.nome}</p>
                    <p className="text-xs text-muted-foreground">{periodo(f.data_inicio, f.data_fim)} · {f.atividades.length} {f.atividades.length === 1 ? "atividade" : "atividades"}</p>
                  </div>
                  <div className="w-32"><Progress value={percFase(f)} aria-label={`Fase ${pct(percFase(f))}`} /></div>
                  <span className="w-12 text-right text-sm font-semibold">{pct(percFase(f))}</span>
                  {editar && <span className="flex" onClick={(e) => e.preventDefault()}>
                    <AcaoIcone titulo="Nova atividade" onClick={() => setAtv({ fase: f, atividade: null })}><Plus className="size-4" /></AcaoIcone>
                    <AcaoIcone titulo="Editar fase" onClick={() => setFase(f)}><Pencil className="size-4" /></AcaoIcone>
                    {perms?.canDelete && <AcaoIcone titulo="Excluir fase" destrutivo onClick={() => excluir("cond_obras_fases", f.id, "a fase e suas atividades")}><Trash2 className="size-4" /></AcaoIcone>}
                  </span>}
                </summary>
                <ul className="divide-y border-t">
                  {f.atividades.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nenhuma atividade nesta fase.</li>}
                  {f.atividades.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                      {a.status === "concluida" ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : a.status === "bloqueada" ? <AlertTriangle className="size-4 text-destructive" aria-hidden /> : <Clock className="size-4 text-muted-foreground" aria-hidden />}
                      <div className="min-w-40 flex-1">
                        <p className="font-medium">{a.descricao}</p>
                        <p className="text-xs text-muted-foreground">{rotulo(STATUS_ATIVIDADE, a.status)} · {periodo(a.data_inicio, a.data_fim)}{a.responsavel && ` · ${a.responsavel}`}</p>
                      </div>
                      {verCusto && a.custo != null && <span className="text-xs">{formatBRL(a.custo)}</span>}
                      <div className="w-24"><Progress value={percAtividade(a)} aria-label={`${pct(percAtividade(a))}`} /></div>
                      <span className="w-12 text-right text-xs font-medium">{pct(percAtividade(a))}</span>
                      {editar && <span className="flex">
                        <AcaoIcone titulo="Editar atividade" onClick={() => setAtv({ fase: f, atividade: a })}><Pencil className="size-4" /></AcaoIcone>
                        {perms?.canDelete && <AcaoIcone titulo="Excluir atividade" destrutivo onClick={() => excluir("cond_obras_atividades", a.id, "a atividade")}><Trash2 className="size-4" /></AcaoIcone>}
                      </span>}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </section>

          <section className="space-y-3" aria-labelledby="t-fotos">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="t-fotos" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Fotos da evolução</h3>
              {editar && <div className="ml-auto flex items-center gap-2">
                <div className="w-32"><SearchSelect value={momento} onChange={setMomento} options={MOMENTOS_FOTO} /></div>
                <input ref={arquivo} type="file" accept="image/*" multiple className="sr-only" aria-label="Escolher fotos" onChange={(e) => void enviarFotos(e.target.files)} />
                <Button size="sm" variant="outline" disabled={enviando} onClick={() => arquivo.current?.click()}>
                  {enviando ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />} Adicionar fotos
                </Button>
              </div>}
            </div>
            {obra.fotos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma foto ainda.</p> : (
              MOMENTOS_FOTO.map((m) => {
                const lista = obra.fotos.filter((f) => f.momento === m.value);
                if (!lista.length) return null;
                return (
                  <div key={m.value} className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{m.label}</p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                      {lista.map((f) => (
                        <div key={f.id} className="group relative">
                          <button type="button" onClick={() => setFoto(f)} className="block w-full overflow-hidden rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Ampliar foto ${m.label}${f.legenda ? `: ${f.legenda}` : ""}`}>
                            <img src={f.url} alt={f.legenda || `Foto ${m.label}`} className="aspect-square w-full object-cover transition group-hover:scale-105" loading="lazy" />
                          </button>
                          {perms?.canDelete && <button type="button" aria-label="Excluir foto" onClick={() => excluir("cond_obras_fotos", f.id, "a foto")}
                            className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-destructive opacity-0 transition focus:opacity-100 group-hover:opacity-100"><X className="size-3.5" /></button>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </div>
        {fase && <FaseDialog obra={obra} condominioId={condominioId} fase={fase === "nova" ? null : fase} onClose={() => setFase(null)} />}
        {atv && <AtividadeDialog condominioId={condominioId} fase={atv.fase} atividade={atv.atividade} onClose={() => setAtv(null)} />}
        <Dialog open={!!foto} onOpenChange={(o) => !o && setFoto(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader><DialogTitle>{foto ? rotulo(MOMENTOS_FOTO, foto.momento) : ""}{foto?.legenda ? ` — ${foto.legenda}` : ""}</DialogTitle>
              <DialogDescription>{foto ? new Date(foto.created_at).toLocaleDateString("pt-BR") : ""}</DialogDescription></DialogHeader>
            {foto && <img src={foto.url} alt={foto.legenda || "Foto da obra"} className="max-h-[75vh] w-full rounded-md object-contain" />}
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}

/* ----------------------------- Formulários ----------------------------- */

function useSalvar(tabela: string, onClose: () => void) {
  const qc = useQueryClient();
  const [salvando, setSalvando] = useState(false);
  const salvar = async (id: string | null, valores: Row): Promise<string | null> => {
    setSalvando(true);
    const t = db.from(tabela);
    const r = id ? await t.update(valores).eq("id", id).select("id").single() : await t.insert(valores).select("id").single();
    setSalvando(false);
    if (r.error) { toast.error(r.error.message); return null; }
    toast.success("Salvo."); void qc.invalidateQueries({ queryKey: ["cond", "obras"] }); onClose();
    return s(r.data?.id);
  };
  return { salvando, salvar };
}

function Rodape({ salvando, onClose, onSalvar }: { salvando: boolean; onClose: () => void; onSalvar: () => void }) {
  return (
    <DialogFooter className="sticky bottom-0 border-t bg-background pt-3">
      <Button variant="outline" onClick={onClose}>Cancelar</Button>
      <Button onClick={onSalvar} disabled={salvando}>{salvando && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
    </DialogFooter>
  );
}

function ObraDialog({ condominioId, obra, onClose, onCriada }: { condominioId: string; obra: Obra | null; onClose: () => void; onCriada: (id: string) => void }) {
  const [f, setF] = useState({
    titulo: obra?.titulo ?? "", observacao: obra?.observacao ?? "", aviso: obra?.aviso ?? "", status: obra?.status ?? "planejada",
    data_inicio: obra?.data_inicio ?? "", data_fim: obra?.data_fim ?? "", custo: numParaMoeda(obra?.custo_previsto ?? null),
    visivel_moradores: obra?.visivel_moradores ?? false, mostrar_custo: obra?.mostrar_custo ?? false,
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const { salvando, salvar } = useSalvar("cond_obras", onClose);
  const ok = async () => {
    if (!f.titulo.trim()) return void toast.error("Informe o nome da obra.");
    if (f.data_inicio && f.data_fim && f.data_fim < f.data_inicio) return void toast.error("A data final não pode ser antes do início.");
    const id = await salvar(obra?.id ?? null, {
      condominio_id: condominioId, titulo: f.titulo.trim(), observacao: f.observacao.trim() || null, aviso: f.aviso.trim() || null, status: f.status,
      data_inicio: f.data_inicio || null, data_fim: f.data_fim || null, custo_previsto: moedaParaNum(f.custo),
      visivel_moradores: f.visivel_moradores, mostrar_custo: f.visivel_moradores && f.mostrar_custo,
    });
    if (id && !obra) onCriada(id);
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>{obra ? "Editar obra" : "Nova obra"}</DialogTitle><DialogDescription>O andamento e o custo realizado são calculados pelas atividades.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="o-tit">Obra *</Label><Input id="o-tit" value={f.titulo} onChange={(e) => set({ titulo: e.target.value })} placeholder="Ex.: Reforma da fachada" /></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="o-obs">Descrição</Label><Textarea id="o-obs" rows={2} value={f.observacao} onChange={(e) => set({ observacao: e.target.value })} placeholder="Ex.: Muro junto à quadra de esportes" /></div>
          <div className="space-y-1"><Label htmlFor="o-ini">Início</Label><CampoData id="o-ini" value={f.data_inicio} inicio={2000} onChange={(v) => set({ data_inicio: v })} /></div>
          <div className="space-y-1"><Label htmlFor="o-fim">Previsão de término</Label><CampoData id="o-fim" value={f.data_fim} inicio={2000} onChange={(v) => set({ data_fim: v })} /></div>
          <div className="space-y-1"><Label>Situação</Label><SearchSelect value={f.status} onChange={(v) => set({ status: v })} options={STATUS_OBRA} /></div>
          <div className="space-y-1"><Label htmlFor="o-custo">Custo previsto (R$)</Label><Input id="o-custo" inputMode="decimal" value={f.custo} onChange={(e) => set({ custo: e.target.value })} onBlur={() => set({ custo: numParaMoeda(moedaParaNum(f.custo)) })} placeholder="0,00" /></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="o-aviso">Recado para os moradores</Label><Textarea id="o-aviso" rows={2} value={f.aviso} onChange={(e) => set({ aviso: e.target.value })} placeholder="Ex.: Na terça, o estacionamento do bloco B ficará interditado." /></div>
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2">
            <div><Label htmlFor="o-vis" className="font-medium">Moradores podem ver esta obra</Label><p className="text-xs text-muted-foreground">Desligado: só a gestão enxerga.</p></div>
            <Switch id="o-vis" checked={f.visivel_moradores} onCheckedChange={(v) => set({ visivel_moradores: v, mostrar_custo: v && f.mostrar_custo })} />
          </div>
          <div className={cn("flex items-center justify-between gap-3 rounded-lg border p-3 sm:col-span-2", !f.visivel_moradores && "opacity-60")}>
            <div><Label htmlFor="o-cus" className="font-medium">Moradores podem ver os custos</Label><p className="text-xs text-muted-foreground">Desligado: veem só o andamento, prazos e fotos.</p></div>
            <Switch id="o-cus" disabled={!f.visivel_moradores} checked={f.mostrar_custo} onCheckedChange={(v) => set({ mostrar_custo: v })} />
          </div>
        </div>
        <Rodape salvando={salvando} onClose={onClose} onSalvar={() => void ok()} />
      </DialogContent>
    </Dialog>
  );
}

function FaseDialog({ obra, condominioId, fase, onClose }: { obra: Obra; condominioId: string; fase: FaseObra | null; onClose: () => void }) {
  const [f, setF] = useState({ nome: fase?.nome ?? "", ordem: String(fase?.ordem ?? obra.fases.length + 1), data_inicio: fase?.data_inicio ?? "", data_fim: fase?.data_fim ?? "" });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const { salvando, salvar } = useSalvar("cond_obras_fases", onClose);
  const ok = () => {
    if (!f.nome.trim()) return void toast.error("Informe o nome da fase.");
    void salvar(fase?.id ?? null, { obra_id: obra.id, condominio_id: condominioId, nome: f.nome.trim(), ordem: Math.max(1, Number(f.ordem) || 1), data_inicio: f.data_inicio || null, data_fim: f.data_fim || null });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>{fase ? "Editar fase" : "Nova fase"}</DialogTitle><DialogDescription>{obra.titulo}</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
          <div className="space-y-1"><Label htmlFor="f-nome">Fase *</Label><Input id="f-nome" value={f.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="Ex.: Cotação" /></div>
          <div className="space-y-1"><Label htmlFor="f-ord">Ordem</Label><Input id="f-ord" type="number" min={1} value={f.ordem} onChange={(e) => set({ ordem: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="f-ini">Início</Label><CampoData id="f-ini" value={f.data_inicio} inicio={2000} onChange={(v) => set({ data_inicio: v })} /></div>
          <div className="space-y-1 sm:col-span-1"><Label htmlFor="f-fim">Término</Label><CampoData id="f-fim" value={f.data_fim} inicio={2000} onChange={(v) => set({ data_fim: v })} /></div>
        </div>
        <Rodape salvando={salvando} onClose={onClose} onSalvar={ok} />
      </DialogContent>
    </Dialog>
  );
}

function AtividadeDialog({ condominioId, fase, atividade, onClose }: { condominioId: string; fase: FaseObra; atividade: AtividadeObra | null; onClose: () => void }) {
  const [f, setF] = useState({
    descricao: atividade?.descricao ?? "", status: atividade?.status ?? "pendente", responsavel: atividade?.responsavel ?? "",
    data_inicio: atividade?.data_inicio ?? "", data_fim: atividade?.data_fim ?? "", percentual: atividade?.percentual ?? 0, custo: numParaMoeda(atividade?.custo ?? null),
  });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const { salvando, salvar } = useSalvar("cond_obras_atividades", onClose);
  const ok = () => {
    if (!f.descricao.trim()) return void toast.error("Informe a atividade.");
    const perc = f.status === "concluida" ? 100 : Math.max(0, Math.min(100, f.percentual));
    void salvar(atividade?.id ?? null, {
      fase_id: fase.id, condominio_id: condominioId, descricao: f.descricao.trim(), status: perc >= 100 ? "concluida" : f.status, responsavel: f.responsavel.trim() || null,
      data_inicio: f.data_inicio || null, data_fim: f.data_fim || null, percentual: perc, custo: moedaParaNum(f.custo), ordem: atividade?.ordem ?? fase.atividades.length + 1,
    });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>{atividade ? "Editar atividade" : "Nova atividade"}</DialogTitle><DialogDescription>Fase: {fase.nome}</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="a-desc">Atividade *</Label><Input id="a-desc" value={f.descricao} onChange={(e) => set({ descricao: e.target.value })} placeholder="Ex.: Cotar cimento" /></div>
          <div className="space-y-1"><Label>Situação</Label><SearchSelect value={f.status} onChange={(v) => set({ status: v, percentual: v === "concluida" ? 100 : f.percentual })} options={STATUS_ATIVIDADE} /></div>
          <div className="space-y-1"><Label htmlFor="a-resp">Responsável</Label><Input id="a-resp" value={f.responsavel} onChange={(e) => set({ responsavel: e.target.value })} placeholder="Ex.: Zelador, engenheiro" /></div>
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className="text-sm font-medium">Quanto já foi feito: <strong>{f.percentual}%</strong></legend>
            <div className="flex flex-wrap gap-1.5">
              {[0, 25, 50, 75, 100].map((v) => (
                <Button key={v} type="button" size="sm" variant={f.percentual === v ? "default" : "outline"} aria-pressed={f.percentual === v}
                  onClick={() => set({ percentual: v, status: v >= 100 ? "concluida" : v > 0 && f.status === "pendente" ? "andamento" : f.status === "concluida" ? "andamento" : f.status })}>{v}%</Button>
              ))}
              <Input aria-label="Percentual exato" type="number" min={0} max={100} className="w-20" value={f.percentual} onChange={(e) => set({ percentual: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
            </div>
          </fieldset>
          <div className="space-y-1"><Label htmlFor="a-ini">Início</Label><CampoData id="a-ini" value={f.data_inicio} inicio={2000} onChange={(v) => set({ data_inicio: v })} /></div>
          <div className="space-y-1"><Label htmlFor="a-fim">Conclusão</Label><CampoData id="a-fim" value={f.data_fim} inicio={2000} onChange={(v) => set({ data_fim: v })} /></div>
          <div className="space-y-1"><Label htmlFor="a-custo">Custo (R$)</Label><Input id="a-custo" inputMode="decimal" value={f.custo} onChange={(e) => set({ custo: e.target.value })} onBlur={() => set({ custo: numParaMoeda(moedaParaNum(f.custo)) })} placeholder="0,00" /></div>
        </div>
        <Rodape salvando={salvando} onClose={onClose} onSalvar={ok} />
      </DialogContent>
    </Dialog>
  );
}
