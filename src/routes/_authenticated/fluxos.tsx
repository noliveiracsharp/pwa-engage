import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position, addEdge,
  useNodesState, useEdgesState, ReactFlowProvider, useReactFlow,
  BaseEdge, EdgeLabelRenderer, getBezierPath,
  type Node, type Edge, type Connection, type NodeProps, type EdgeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Bot, Clock, GitBranch, Hourglass, KanbanSquare, ListOrdered, MessageSquare,
  MessageCircleQuestion, PhoneForwarded, Plus, Save, Trash2, UserPlus, Workflow, Zap, PenLine, CircleStop, Globe, Code2, X, FlaskConical, Upload, Copy, Play,
  Split, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COMANDOS_PADRAO, MENSAGENS_PADRAO } from "@/lib/comandos-fluxo";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { pick, type Row } from "@/lib/row";
import { corEtapa } from "@/lib/kanban-cores";
import { IaPropriedades } from "@/components/fluxos/IaPropriedades";
import { SimuladorFluxo } from "@/components/fluxos/SimuladorFluxo";
import { TesteHttp } from "@/components/fluxos/TesteHttp";
import { PainelEntrada } from "@/components/fluxos/PainelEntrada";
import {
  CATALOGO, dadosPadrao, nomeTipo, resumoNo, saidasDoNo, temEntrada,
  type CategoriaNo, type DadosNo, type TipoNo,
} from "@/lib/fluxos";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { createContext, useContext } from "react";
import { CampoVariaveis } from "@/components/ui/campo-variaveis";
import type { VariavelDef } from "@/lib/variaveis";
import { tagDoKanban } from "@/lib/qr-direto";

const VARS_CONTATO: VariavelDef[] = [
  { chave: "nome", descricao: "Nome do contato" },
  { chave: "telefone", descricao: "Telefone do contato" },
  { chave: "email", descricao: "E-mail do contato" },
  { chave: "protocolo", descricao: "Protocolo do atendimento" },
  { chave: "ultima_mensagem", descricao: "Última mensagem do cliente" },
];
const DuplicarCtx = createContext<(id: string) => void>(() => {});
const VarsCtx = createContext<{ vars: VariavelDef[]; empresaId: string | null }>({ vars: VARS_CONTATO, empresaId: null });

/** Variáveis que os blocos do fluxo criam (perguntas, HTTP, JavaScript). */
function variaveisDoFluxo(nos: FluxoNode[]): VariavelDef[] {
  const out = [...VARS_CONTATO];
  for (const n of nos) {
    const v = String(n.data["variavel"] ?? "").trim();
    const t = n.data.tipo;
    if (t === "http") {
      const b = v || "resposta";
      out.push({ chave: b, descricao: "Resposta da API (use .campo)" }, { chave: `${b}_status`, descricao: "Status HTTP" }, { chave: `${b}_erro`, descricao: "Erro da chamada" });
    } else if (v) out.push({ chave: v, descricao: `Criada no bloco ${nomeTipo(t)}` });
  }
  const m = new Map(out.map((x) => [x.chave, x]));
  return [...m.values()];
}

/** Campo com autocomplete `{{` usando as variáveis do fluxo aberto. */
function CampoFluxo({ value, onChange, linha, rows, mono, className }: { value: string; onChange: (v: string) => void; linha?: boolean; rows?: number; mono?: boolean; className?: string }) {
  const { vars, empresaId } = useContext(VarsCtx);
  return <CampoVariaveis className={className ?? ""} value={value} onChange={onChange} variaveis={vars} empresaId={empresaId ?? undefined} linha={!!linha} rows={rows ?? 4} campoClassName={mono ? "font-mono text-xs" : ""} />;
}

export const Route = createFileRoute("/_authenticated/fluxos")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Fluxos de Atendimento — Atende.ai" },
      { name: "description", content: "Monte chatbots e fluxos de atendimento visualmente, integrados ao Kanban." },
      { property: "og:title", content: "Fluxos de Atendimento — Atende.ai" },
      { property: "og:description", content: "Monte chatbots e fluxos de atendimento visualmente, integrados ao Kanban." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <ReactFlowProvider>
      <FluxosPage />
    </ReactFlowProvider>
  ),
});

const ICONES: Record<TipoNo, typeof Zap> = {
  gatilho: Zap, mensagem: MessageSquare, menu: ListOrdered, pergunta: MessageCircleQuestion,
  condicao: GitBranch, switch: Split, horario: Clock, atraso: Hourglass, kanban: KanbanSquare, atribuir: UserPlus,
  campo: PenLine, ia: Bot, transbordo: PhoneForwarded, encerrar: CircleStop, subfluxo: Workflow, http: Globe, codigo: Code2,
};
const COR_CATEGORIA: Record<CategoriaNo, string> = {
  Gatilhos: "bg-warning text-warning-foreground",
  Mensagens: "bg-primary text-primary-foreground",
  "Lógica": "bg-stage-violet text-primary-foreground",
  "Kanban / CRM": "bg-stage-cyan text-primary-foreground",
  "Integrações": "bg-stage-pink text-primary-foreground",
  IA: "bg-stage-pink text-primary-foreground",
  Fim: "bg-destructive text-destructive-foreground",
};

type NoData = DadosNo & { tipo: TipoNo; resumo?: string };
type FluxoNode = Node<NoData>;

function BlocoNo({ id, data, selected }: NodeProps<FluxoNode>) {
  const { deleteElements } = useReactFlow();
  const duplicar = useContext(DuplicarCtx);
  const cat = CATALOGO.find((c) => c.tipo === data.tipo)!.categoria;
  const Icone = ICONES[data.tipo];
  const saidas = saidasDoNo(data.tipo, data);
  return (
    <div className={cn("group w-60 rounded-lg border bg-card text-card-foreground shadow-sm", selected && "ring-2 ring-primary")}>
      {temEntrada(data.tipo) && <Handle type="target" position={Position.Left} className="!size-3 !bg-muted-foreground" />}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded", COR_CATEGORIA[cat])}>
          <Icone className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{data.titulo || nomeTipo(data.tipo)}</span>
        {data.tipo !== "gatilho" && (
          <button
            type="button"
            aria-label="Duplicar bloco"
            title="Duplicar bloco"
            className="nodrag flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={(e) => { e.stopPropagation(); duplicar(id); }}
          >
            <Copy className="size-3.5" />
          </button>
        )}
        {data.tipo !== "gatilho" && (
          <button
            type="button"
            aria-label="Excluir bloco"
            title="Excluir bloco"
            className="nodrag flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
            onClick={(e) => { e.stopPropagation(); void deleteElements({ nodes: [{ id }] }); }}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {data["erroTeste"] ? <p className="border-b bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive">⚠ {String(data["erroTeste"])}</p> : null}
      {data.resumo ? <p className="line-clamp-3 whitespace-pre-line px-3 py-2 text-xs text-muted-foreground">{data.resumo}</p> : null}
      {saidas.length === 1 && saidas[0]!.rotulo === "" ? (
        <Handle type="source" position={Position.Right} id={saidas[0]!.id} className="!size-3 !bg-primary" />
      ) : (
        <div className="space-y-1 pb-2">
          {saidas.map((s) => (
            <div key={s.id} className="relative pr-4 text-right text-[11px] text-muted-foreground">
              <span className="truncate">{s.rotulo}</span>
              <Handle type="source" position={Position.Right} id={s.id} className="!size-3 !bg-primary" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LigacaoEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, markerEnd }: EdgeProps) {
  const { deleteElements } = useReactFlow();
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        {...(markerEnd ? { markerEnd } : {})}
        interactionWidth={24}
        style={selected
          ? { stroke: "var(--primary)", strokeWidth: 3, strokeDasharray: "6 4", animation: "dashdraw 0.6s linear infinite" }
          : { strokeWidth: 2 }}
      />
      {selected && (
        <EdgeLabelRenderer>
          <button
            type="button"
            aria-label="Excluir ligação"
            title="Excluir ligação (Del)"
            className="nodrag nopan absolute flex size-5 items-center justify-center rounded-full border bg-destructive text-destructive-foreground shadow"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, pointerEvents: "all" }}
            onClick={() => void deleteElements({ edges: [{ id }] })}
          >
            <X className="size-3" />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
const nodeTypes = { bloco: BlocoNo };
const edgeTypes = { ligacao: LigacaoEdge };

function useRows(table: string) {
  return useQuery({
    queryKey: ["table", table],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.from(table).select("*");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
}

function FluxosPage() {
  const qc = useQueryClient();
  const { empresa } = useAuth();
  const empresaId = empresa ? String(empresa["id"]) : null;
  const { screenToFlowPosition } = useReactFlow();

  const fluxosQ = useQuery({
    queryKey: ["fluxos_atendimento", empresaId],
    queryFn: async (): Promise<Row[]> => {
      let q = supabase.from("fluxos_atendimento").select("*").order("created_at");
      if (empresaId) q = q.eq("empresa_id", empresaId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const { data: quadros = [] } = useRows("kanban_nome");
  const { data: etapas = [] } = useRows("kanban_etapas");
  const { data: campos = [] } = useRows("empresas_camposperson");
  const { data: instanciasTodas = [] } = useRows("empresas_instancias");
  const instancias = instanciasTodas.filter((i) => !empresaId || String(i["empresa_id"] ?? "") === empresaId);

  const fluxos = fluxosQ.data ?? [];
  const [fluxoId, setFluxoId] = useState<string>("");
  const fluxo = fluxos.find((f) => String(f["id"]) === fluxoId);
  const [nome, setNome] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [instanciaId, setInstanciaId] = useState<string>("todas");
  const [nodes, setNodes, onNodesChange] = useNodesState<FluxoNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!fluxoId && fluxos.length) setFluxoId(String(fluxos[0]!["id"]));
  }, [fluxos, fluxoId]);

  const nomesKanban = useCallback((d: DadosNo) => {
    const q = quadros.find((k) => String(k["id"]) === String(d["quadro_id"] ?? ""));
    const e = etapas.find((k) => String(k["id"]) === String(d["etapa_id"] ?? ""));
    return {
      quadro: q ? pick<string>(q, ["nome", "descricao", "titulo"]) : undefined,
      etapa: e ? pick<string>(e, ["descricao", "nome", "titulo"]) : undefined,
      fluxo: d["fluxo_id"] ? (fluxos.find((f) => String(f["id"]) === String(d["fluxo_id"]))?.["nome"] as string | undefined) : undefined,
    };
  }, [quadros, etapas, fluxos]);

  const comResumo = useCallback(
    (d: NoData): NoData => ({ ...d, resumo: resumoNo(d.tipo, d, nomesKanban(d)) }),
    [nomesKanban],
  );

  useEffect(() => {
    if (!fluxo) { setNodes([]); setEdges([]); return; }
    setNome(String(fluxo["nome"] ?? ""));
    setAtivo(Boolean(fluxo["ativo"]));
    setInstanciaId(fluxo["instancia_id"] ? String(fluxo["instancia_id"]) : "todas");
    const ns = ((fluxo["nos"] as FluxoNode[]) ?? []).map((n) => ({ ...n, type: "bloco", data: comResumo(n.data) }));
    setNodes(ns);
    setEdges(((fluxo["conexoes"] as Edge[]) ?? []).map((e) => ({ ...e, type: "ligacao" })));
    setSelId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fluxoId, fluxo?.["updated_at"]]);

  const onConnect = useCallback(
    (c: Connection) => setEdges((es) => addEdge({ ...c, type: "ligacao" }, es.filter((e) => !(e.source === c.source && e.sourceHandle === c.sourceHandle)))),
    [setEdges],
  );

  const novoFluxo = async () => {
    const inicio: FluxoNode = { id: "inicio", type: "bloco", position: { x: 80, y: 160 }, data: { tipo: "gatilho", ...dadosPadrao("gatilho") } };
    const { data, error } = await supabase.from("fluxos_atendimento")
      .insert({ nome: `Novo fluxo ${fluxos.length + 1}`, empresa_id: empresaId, nos: [inicio], conexoes: [] })
      .select().single();
    if (error) { toast.error("Não foi possível criar o fluxo", { description: error.message }); return; }
    await qc.invalidateQueries({ queryKey: ["fluxos_atendimento"] });
    setFluxoId(String((data as Row)["id"]));
  };

  const salvar = async () => {
    if (!fluxo) return;
    setSalvando(true);
    const nos = nodes.map(({ id, position, data }) => {
      const { resumo: _r, ...d } = data;
      return { id, position, data: d };
    });
    const conexoes = edges.map(({ id, source, target, sourceHandle, targetHandle }) => ({ id, source, target, sourceHandle, targetHandle }));
    const gat = nodes.find((n) => n.data.tipo === "gatilho")?.data;
    const { error } = await supabase.from("fluxos_atendimento").update({
      nome, ativo, nos, conexoes,
      instancia_id: instanciaId === "todas" ? null : instanciaId,
      gatilho: gat?.["gatilho"] ?? "mensagem_recebida",
      palavras_chave: gat?.["palavras"] ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", fluxo["id"] as string);
    setSalvando(false);
    if (error) { toast.error("Erro ao salvar", { description: error.message }); return; }
    toast.success("Fluxo salvo");
    qc.invalidateQueries({ queryKey: ["fluxos_atendimento"] });
  };

  const excluirFluxo = async () => {
    if (!fluxo || !await confirmar(`Excluir o fluxo "${nome}"?`)) return;
    const { error } = await supabase.from("fluxos_atendimento").delete().eq("id", fluxo["id"] as string);
    if (error) { toast.error("Erro ao excluir", { description: error.message }); return; }
    setFluxoId("");
    qc.invalidateQueries({ queryKey: ["fluxos_atendimento"] });
  };

  const adicionar = (tipo: TipoNo, pos?: { x: number; y: number }) => {
    if (!fluxo) { toast.info("Crie ou selecione um fluxo primeiro"); return; }
    const id = `${tipo}-${Date.now().toString(36)}`;
    const position = pos ?? screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    setNodes((ns) => [...ns, { id, type: "bloco", position, data: comResumo({ tipo, ...dadosPadrao(tipo) }) }]);
    setSelId(id);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const tipo = e.dataTransfer.getData("application/fluxo-no") as TipoNo;
    if (tipo) adicionar(tipo, screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  };

  const sel = nodes.find((n) => n.id === selId);
  const atualizarSel = (patch: DadosNo) =>
    setNodes((ns) => ns.map((n) => (n.id === selId ? { ...n, data: comResumo({ ...n.data, ...patch } as NoData) } : n)));
  const duplicarNo = useCallback((id: string) => {
    const novoId = `copia-${Date.now().toString(36)}`;
    setNodes((ns) => {
      const o = ns.find((n) => n.id === id);
      if (!o || o.data.tipo === "gatilho") return ns;
      const data = JSON.parse(JSON.stringify(o.data)) as NoData;
      if (data.titulo) data.titulo = `${String(data.titulo)} (cópia)`;
      return [...ns.map((n) => ({ ...n, selected: false })), { id: novoId, type: "bloco", position: { x: o.position.x + 40, y: o.position.y + 60 }, data, selected: true }];
    });
    toast.success("Bloco duplicado");
  }, [setNodes]);
  const removerSel = () => {
    if (!sel || sel.data.tipo === "gatilho") return;
    setNodes((ns) => ns.filter((n) => n.id !== selId));
    setEdges((es) => es.filter((e) => e.source !== selId && e.target !== selId));
    setSelId(null);
  };

  const categorias = useMemo(() => Array.from(new Set(CATALOGO.map((c) => c.categoria))), []);
  const [testando, setTestando] = useState(false);
  const [painelAberto, setPainelAberto] = useState(true);
  const [buscaBloco, setBuscaBloco] = useState("");
  const normBusca = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const blocosFiltrados = useMemo(() => {
    const q = normBusca(buscaBloco.trim());
    return CATALOGO.filter((c) => c.tipo !== "gatilho" && (!q || normBusca(`${c.nome} ${c.descricao} ${c.categoria}`).includes(q)));
  }, [buscaBloco]);
  const [trilhaTeste, setTrilhaTeste] = useState<{ visitados: string[]; atual: string | null; erro?: { id: string; msg: string } | null }>({ visitados: [], atual: null });
  const [entradasTeste, setEntradasTeste] = useState<Record<string, Record<string, string>>>({});
  const nosVisiveis = useMemo(() => {
    if (!trilhaTeste.visitados.length && !trilhaTeste.atual && !trilhaTeste.erro) return nodes;
    const vis = new Set(trilhaTeste.visitados);
    return nodes.map((n) => ({
      ...n,
      ...(n.id === trilhaTeste.erro?.id ? { data: { ...n.data, erroTeste: trilhaTeste.erro.msg } } : {}),
      className: n.id === trilhaTeste.erro?.id ? "rounded-lg ring-4 ring-destructive animate-pulse" : n.id === trilhaTeste.atual ? "rounded-lg ring-4 ring-warning animate-pulse" : vis.has(n.id) ? "rounded-lg ring-2 ring-success" : "opacity-60",
    }));
  }, [nodes, trilhaTeste]);

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[520px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Workflow className="size-5 text-primary" />
        <Select value={fluxoId} onValueChange={setFluxoId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Selecione um fluxo" /></SelectTrigger>
          <SelectContent>
            {fluxos.map((f) => <SelectItem key={String(f["id"])} value={String(f["id"])}>{String(f["nome"])}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={novoFluxo}><Plus className="size-4" /> Novo fluxo</Button>
        {fluxo && (
          <>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-9 w-56" aria-label="Nome do fluxo" />
            <Select value={instanciaId} onValueChange={setInstanciaId}>
              <SelectTrigger className="h-9 w-56" aria-label="Instância do fluxo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as instâncias (geral)</SelectItem>
                {instancias.map((i) => (
                  <SelectItem key={String(i["id"])} value={String(i["id"])}>{pick<string>(i, ["nome", "descricao", "telefone"]) ?? "Instância"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm"><Switch checked={ativo} onCheckedChange={setAtivo} /> Ativo</label>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setTestando(true)}><FlaskConical className="size-4" /> Testar fluxo</Button>
              <Button variant="ghost" size="sm" onClick={excluirFluxo}><Trash2 className="size-4" /></Button>
              <Button size="sm" onClick={salvar} disabled={salvando}><Save className="size-4" /> {salvando ? "Salvando…" : "Salvar"}</Button>
            </div>
          </>
        )}
      </div>
      {fluxosQ.error ? (
        <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          Não foi possível carregar os fluxos. Execute o script <b>atendeai-fluxos-atendimento.sql</b> no banco e recarregue.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3">
          {!painelAberto ? (
            <aside className="hidden shrink-0 md:block">
              <Button variant="outline" size="icon" title="Abrir painel de blocos" aria-label="Abrir painel de blocos" onClick={() => setPainelAberto(true)}>
                <PanelLeftOpen className="size-4" />
              </Button>
            </aside>
          ) : (
          <aside className="hidden w-56 shrink-0 space-y-3 overflow-y-auto rounded-lg border bg-card p-2 md:block">
            <div className="flex items-center gap-1">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={buscaBloco} onChange={(e) => setBuscaBloco(e.target.value)} placeholder="Buscar bloco…" className="h-8 pl-7 text-sm" />
              </div>
              <Button variant="ghost" size="icon" className="size-8 shrink-0" title="Recolher painel" aria-label="Recolher painel" onClick={() => setPainelAberto(false)}>
                <PanelLeftClose className="size-4" />
              </Button>
            </div>
            {blocosFiltrados.length === 0 && <p className="px-1 text-xs text-muted-foreground">Nenhum bloco encontrado.</p>}
            {categorias.filter((cat) => blocosFiltrados.some((c) => c.categoria === cat)).map((cat) => (
              <div key={cat}>
                <p className="px-1 pb-1 text-[11px] font-semibold uppercase text-muted-foreground">{cat}</p>
                {blocosFiltrados.filter((c) => c.categoria === cat).map((c) => {
                  const Icone = ICONES[c.tipo];
                  return (
                    <button
                      key={c.tipo} type="button" draggable
                      onDragStart={(e) => e.dataTransfer.setData("application/fluxo-no", c.tipo)}
                      onClick={() => adicionar(c.tipo)}
                      className="flex w-full items-start gap-2 rounded-md p-1.5 text-left hover:bg-accent"
                    >
                      <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded", COR_CATEGORIA[c.categoria])}><Icone className="size-3.5" /></span>
                      <span className="min-w-0">
                        <span className="block text-sm">{c.nome}</span>
                        <span className="block text-[11px] leading-tight text-muted-foreground">{c.descricao}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </aside>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border bg-muted/30" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
            {fluxo ? (
              <DuplicarCtx.Provider value={duplicarNo}>
              <ReactFlow
                nodes={nosVisiveis} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
                defaultEdgeOptions={{ type: "ligacao" }}
                onBeforeDelete={async ({ nodes: ns, edges: es }) => ({ nodes: ns.filter((n) => (n.data as NoData).tipo !== "gatilho"), edges: es })}
                onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
                onNodeClick={(_, n) => setSelId(n.id)} onPaneClick={() => setSelId(null)}
                fitView deleteKeyCode={["Delete", "Backspace"]} proOptions={{ hideAttribution: true }}
              >
                <Background gap={18} />
                <Controls />
                <MiniMap pannable zoomable className="!bg-card" />
              </ReactFlow>
              </DuplicarCtx.Provider>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <Workflow className="size-10" />
                Crie seu primeiro fluxo para começar a montar o atendimento automático.
                <Button size="sm" onClick={novoFluxo}><Plus className="size-4" /> Novo fluxo</Button>
              </div>
            )}
          </div>
          <SimuladorFluxo
        open={testando} onOpenChange={setTestando} onSelecionar={setSelId}
        nos={nodes as unknown as import("@/lib/fluxos-motor").NoFluxo[]}
        conexoes={edges.map((e) => ({ source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null }))}
        onTrilha={(visitados, atual, extra) => { setTrilhaTeste({ visitados, atual, erro: extra?.erro ?? null }); if (extra?.entradas) setEntradasTeste(extra.entradas); }}
      />
          </div>
        </div>
      )}

      <Sheet open={!!sel} onOpenChange={(o) => !o && setSelId(null)} modal={false}>
        <SheetContent side="right" semFundo onInteractOutside={(e) => e.preventDefault()} className={cn("flex flex-col shadow-2xl", "sm:max-w-[min(1400px,95vw)] lg:w-[70vw]")} data-no-guard>
          {sel && (
            <>
              <SheetHeader>
                <SheetTitle>{nomeTipo(sel.data.tipo)}</SheetTitle>
                <SheetDescription>{CATALOGO.find((c) => c.tipo === sel.data.tipo)?.descricao}</SheetDescription>
              </SheetHeader>
              <div className={cn("grid flex-1 gap-4 overflow-y-auto px-4", sel.data.tipo === "http" ? "lg:grid-cols-[1fr_1.2fr_1.2fr]" : "lg:grid-cols-[1fr_1.4fr]")}>
                {sel.data.tipo !== "gatilho" && <div className="min-h-[300px] lg:max-h-[calc(100dvh-12rem)]"><PainelEntrada vars={entradasTeste[sel.id]} /></div>}
                <div className="space-y-4">
                  <Campo label="Título do bloco">
                    <Input value={String(sel.data.titulo ?? "")} placeholder={nomeTipo(sel.data.tipo)} onChange={(e) => atualizarSel({ titulo: e.target.value })} />
                  </Campo>
                  <VarsCtx.Provider value={{ vars: variaveisDoFluxo(nodes as FluxoNode[]), empresaId }}><Propriedades no={sel} atualizar={atualizarSel} quadros={quadros} etapas={etapas} campos={campos} fluxos={fluxos.filter((f) => String(f["id"]) !== fluxoId)} /></VarsCtx.Provider>
                </div>
                {sel.data.tipo === "http" && <TesteHttp d={sel.data as Record<string, unknown>} variavel={String(sel.data["variavel"] || "resposta")} />}
              </div>
              <SheetFooter className="flex-row justify-between border-t">
                <div className="flex gap-1">
                  <Button variant="ghost" onClick={removerSel} disabled={sel.data.tipo === "gatilho"}><Trash2 className="size-4" /> Excluir bloco</Button>
                  <Button variant="ghost" onClick={() => duplicarNo(sel.id)} disabled={sel.data.tipo === "gatilho"}><Copy className="size-4" /> Duplicar</Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setTestando(true)}><Play className="size-4" /> Testar até aqui</Button>
                  <Button onClick={() => setSelId(null)}>Concluir</Button>
                </div>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Campo({ label, children, ajuda }: { label: string; children: React.ReactNode; ajuda?: string | undefined }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {ajuda && <p className="text-xs text-muted-foreground">{ajuda}</p>}
    </div>
  );
}

type AnexoEd = { url: string; tipo: "imagem" | "video" | "documento"; nome?: string };
const tipoDoArquivo = (f: File): AnexoEd["tipo"] => (f.type.startsWith("image/") ? "imagem" : f.type.startsWith("video/") ? "video" : "documento");

function PreviewAnexo({ a, remover }: { a: AnexoEd; remover: () => void }) {
  return (
    <div className="relative inline-block">
      {a.url.startsWith("http") && a.tipo === "imagem" ? <img src={a.url} alt="" className="h-28 rounded border object-cover" />
        : a.url.startsWith("http") && a.tipo === "video" ? <video src={a.url} className="h-28 rounded border" />
        : <div className="flex h-28 w-32 flex-col items-center justify-center gap-1 rounded border p-2 text-center text-xs text-muted-foreground"><FileText className="size-6" /><span className="line-clamp-2 break-all">{a.nome || a.url || "Arquivo"}</span></div>}
      <Button type="button" variant="destructive" size="icon" aria-label="Remover arquivo" className="absolute -right-2 -top-2 size-6 rounded-full" onClick={remover}>
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

function MidiaMensagem({ d, atualizar }: { d: DadosNo; atualizar: (p: DadosNo) => void }) {
  const { empresaId } = useContext(VarsCtx);
  const [subindo, setSubindo] = useState(false);
  const tipo = String(d["midia_tipo"] || "nenhuma");
  const url = String(d["midia_url"] ?? "");
  const extras: AnexoEd[] = Array.isArray(d["anexos"]) ? (d["anexos"] as AnexoEd[]) : [];
  const enviar = async (file: File) => {
    const path = `${empresaId ?? "geral"}/fluxos/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("chat_media").upload(path, file, file.type ? { contentType: file.type } : undefined);
    if (up.error) { toast.error(`Não foi possível enviar ${file.name}: ${up.error.message}`); return null; }
    return { url: supabase.storage.from("chat_media").getPublicUrl(path).data.publicUrl, tipo: tipoDoArquivo(file), nome: file.name } as AnexoEd;
  };
  const subir = async (file: File) => {
    setSubindo(true);
    const a = await enviar(file);
    setSubindo(false);
    if (a) atualizar({ midia_url: a.url, midia_tipo: a.tipo, midia_nome: a.nome });
  };
  const subirVarios = async (files: File[]) => {
    setSubindo(true);
    const novos: AnexoEd[] = [];
    for (const f of files) { const a = await enviar(f); if (a) novos.push(a); }
    setSubindo(false);
    if (!novos.length) return;
    // Sem mídia principal, o primeiro arquivo assume esse lugar (vai com a legenda).
    if (tipo === "nenhuma" || !url) {
      const [p, ...r] = novos;
      atualizar({ midia_url: p!.url, midia_tipo: p!.tipo, midia_nome: p!.nome, anexos: [...extras, ...r] });
    } else atualizar({ anexos: [...extras, ...novos] });
  };
  const limparPrincipal = () => {
    const [p, ...r] = extras;
    atualizar(p ? { midia_url: p.url, midia_tipo: p.tipo, midia_nome: p.nome ?? "", anexos: r } : { midia_tipo: "", midia_url: "", midia_nome: "" });
  };
  return (
    <>
      <Campo label="Anexar mídia">
        <Select value={tipo} onValueChange={(v) => atualizar(v === "nenhuma" ? { midia_tipo: "", midia_url: "", midia_nome: "", anexos: [] } : { midia_tipo: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="nenhuma">Nenhuma (só texto)</SelectItem>
            <SelectItem value="documento">Documento / PDF</SelectItem>
            <SelectItem value="imagem">Imagem</SelectItem>
            <SelectItem value="video">Vídeo</SelectItem>
          </SelectContent>
        </Select>
      </Campo>
      {tipo !== "nenhuma" && (
        <Campo label="Arquivo principal (vai com a legenda)" ajuda="Envie o arquivo ou cole um endereço público. Aceita variáveis, ex.: {{foto}}. Vídeos até 16 MB.">
          <div className="flex gap-2">
            <CampoFluxo className="min-w-0 flex-1" linha mono value={url} onChange={(v) => atualizar({ midia_url: v })} />
            <Button type="button" variant="outline" size="icon" disabled={subindo} asChild>
              <label aria-label="Enviar arquivo" className="cursor-pointer">
                <Upload className="size-4" />
                <input type="file" className="hidden" accept={tipo === "imagem" ? "image/*" : tipo === "video" ? "video/*" : undefined}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); e.target.value = ""; }} />
              </label>
            </Button>
            {url && <Button type="button" variant="outline" size="icon" aria-label="Remover arquivo" onClick={limparPrincipal}><X className="size-4" /></Button>}
          </div>
        </Campo>
      )}
      <Campo label="Mais arquivos" ajuda="Imagens, vídeos e PDFs extras são enviados em sequência, logo após a mensagem.">
        <Button type="button" variant="outline" size="sm" disabled={subindo} asChild>
          <label className="cursor-pointer"><Plus className="mr-1 size-4" /> Adicionar arquivos
            <input type="file" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) void subirVarios(fs); e.target.value = ""; }} />
          </label>
        </Button>
      </Campo>
      {subindo && <p className="text-xs text-muted-foreground">Enviando arquivo…</p>}
      {(url || extras.length > 0) && (
        <div className="flex flex-wrap gap-3 pt-1">
          {url && tipo !== "nenhuma" && <PreviewAnexo a={{ url, tipo: tipo as AnexoEd["tipo"], nome: String(d["midia_nome"] ?? "") }} remover={limparPrincipal} />}
          {extras.map((a, i) => <PreviewAnexo key={`${a.url}-${i}`} a={a} remover={() => atualizar({ anexos: extras.filter((_, j) => j !== i) })} />)}
        </div>
      )}
    </>
  );
}

function Propriedades({ no, atualizar, quadros, etapas, campos, fluxos }: {
  no: FluxoNode; atualizar: (p: DadosNo) => void; quadros: Row[]; etapas: Row[]; campos: Row[]; fluxos: Row[];
}) {
  const d = no.data;
  const s = (k: string) => String(d[k] ?? "");
  const texto = (label: string, k = "texto", ajuda?: string) => (
    <Campo label={label} ajuda={ajuda}><CampoFluxo value={s(k)} onChange={(v) => atualizar({ [k]: v })} /></Campo>
  );
  switch (d.tipo) {
    case "gatilho":
      return (
        <>
          <Campo label="Quando iniciar">
            <Select value={s("gatilho")} onValueChange={(v) => atualizar({ gatilho: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mensagem_recebida">Qualquer mensagem recebida</SelectItem>
                <SelectItem value="palavra_chave">Palavra-chave</SelectItem>
                <SelectItem value="novo_contato">Novo contato</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          {d["gatilho"] === "palavra_chave" && (
            <Campo label="Palavras-chave" ajuda="Separe por vírgula"><Input value={s("palavras")} onChange={(e) => atualizar({ palavras: e.target.value })} /></Campo>
          )}
          <div className="mt-2 space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">Comandos do cliente (valem em qualquer etapa)</p>
            <p className="text-xs text-muted-foreground">
              Já ativos: #{COMANDOS_PADRAO.inicio.join(", #")} (volta ao início) · #{COMANDOS_PADRAO.atendente.join(", #")} (atendente) · #{COMANDOS_PADRAO.sair.join(", #")} (encerra).
            </p>
            <Campo label="Palavras extras para voltar ao início" ajuda="Opcional, separe por vírgula. Ex.: 0, home"><Input value={s("cmd_inicio")} onChange={(e) => atualizar({ cmd_inicio: e.target.value })} /></Campo>
            <Campo label="Palavras extras para falar com atendente" ajuda="Opcional. Ex.: 9, urgente"><Input value={s("cmd_atendente")} onChange={(e) => atualizar({ cmd_atendente: e.target.value })} /></Campo>
            <Campo label="Mensagem ao transferir"><Textarea rows={2} placeholder={MENSAGENS_PADRAO.atendente} value={s("msg_atendente")} onChange={(e) => atualizar({ msg_atendente: e.target.value })} /></Campo>
            <Campo label="Fila do atendente (quadro)" ajuda="Vazio: continua no quadro atual">
              <Select value={s("atendente_quadro_id")} onValueChange={(v) => atualizar({ atendente_quadro_id: v, atendente_etapa_id: "" })}>
                <SelectTrigger><SelectValue placeholder="Quadro atual" /></SelectTrigger>
                <SelectContent>
                  {quadros.map((q) => <SelectItem key={String(q["id"])} value={String(q["id"])}>{pick<string>(q, ["nome", "descricao", "titulo"])}</SelectItem>)}
                </SelectContent>
              </Select>
            </Campo>
            {s("atendente_quadro_id") && (
              <Campo label="Etapa da fila">
                <Select value={s("atendente_etapa_id")} onValueChange={(v) => atualizar({ atendente_etapa_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Escolha a etapa" /></SelectTrigger>
                  <SelectContent>
                    {etapas.filter((e) => String(pick(e, ["kanban_nome_id", "kanban_id"]) ?? "") === s("atendente_quadro_id"))
                      .sort((a, b) => Number(a["ordem"] ?? 0) - Number(b["ordem"] ?? 0))
                      .map((e) => <SelectItem key={String(e["id"])} value={String(e["id"])}>{pick<string>(e, ["descricao", "nome", "titulo"])}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Campo>
            )}
            <Campo label="Palavras extras para encerrar" ajuda="Opcional"><Input value={s("cmd_sair")} onChange={(e) => atualizar({ cmd_sair: e.target.value })} /></Campo>
            <Campo label="Mensagem ao encerrar"><Textarea rows={2} placeholder={MENSAGENS_PADRAO.sair} value={s("msg_sair")} onChange={(e) => atualizar({ msg_sair: e.target.value })} /></Campo>
          </div>
        </>
      );
    case "http":
      return (
        <>
          <Campo label="Método">
            <Select value={s("metodo") || "GET"} onValueChange={(v) => atualizar({ metodo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Endereço (URL)" ajuda="Aceita variáveis, ex.: https://api.site.com/clientes?tel={{telefone}}">
            <CampoFluxo linha mono value={s("url")} onChange={(v) => atualizar({ url: v })} />
          </Campo>
          <Campo label="Cabeçalhos" ajuda="Um por linha, ex.: Authorization: Bearer SEU_TOKEN">
            <CampoFluxo rows={3} mono value={s("cabecalhos")} onChange={(v) => atualizar({ cabecalhos: v })} />
          </Campo>
          {!["GET", "DELETE"].includes(s("metodo") || "GET") && (
            <Campo label="Corpo (JSON)" ajuda='Ex.: {"telefone": "{{telefone}}"}'>
              <CampoFluxo rows={5} mono value={s("corpo")} onChange={(v) => atualizar({ corpo: v })} />
            </Campo>
          )}
          <Campo label="Guardar resposta em" ajuda={`Use {{${s("variavel") || "resposta"}.campo}} nas mensagens, ou trate listas no bloco JavaScript. O status fica em {{${s("variavel") || "resposta"}_status}}.`}>
            <Input value={s("variavel")} onChange={(e) => atualizar({ variavel: e.target.value })} />
          </Campo>
        </>
      );
    case "codigo":
      return (
        <Campo label="Código JavaScript" ajuda="Use input.<variável> (respostas de API já vêm como objeto/lista). Faça return { nome: valor } — cada chave vira uma variável para os próximos blocos, ex.: {{lista}}.">
          <Textarea rows={16} spellCheck={false} className="font-mono text-xs" value={s("codigo")} onChange={(e) => atualizar({ codigo: e.target.value })} />
        </Campo>
      );
    case "mensagem":
      return <>{texto("Mensagem", "texto", "Use {{nome}} ou {{protocolo}} para inserir variáveis. Com mídia, vira a legenda.")}<MidiaMensagem d={d} atualizar={atualizar} /></>;
    case "transbordo": case "encerrar":
      return texto("Mensagem", "texto", "Use {{nome}} para inserir variáveis");
    case "menu":
      return (
        <>
          <Campo label="Formato no WhatsApp" ajuda="Lista abre um botão com as opções para tocar. Se o WhatsApp recusar, vai como texto numerado.">
            <Select value={s("formato") || "texto"} onValueChange={(v) => atualizar({ formato: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lista">Lista interativa (botão)</SelectItem>
                <SelectItem value="texto">Texto numerado (normal)</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          {s("formato") === "lista" && (
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Título da lista"><Input value={s("lista_titulo")} placeholder="Opções" onChange={(e) => atualizar({ lista_titulo: e.target.value })} /></Campo>
              <Campo label="Texto do botão"><Input value={s("lista_botao")} placeholder="Ver opções" maxLength={20} onChange={(e) => atualizar({ lista_botao: e.target.value })} /></Campo>
            </div>
          )}
          {texto("Mensagem")}
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">Lista vinda de API (opcional)</p>
            <p className="text-xs text-muted-foreground">O cliente vê só o texto do rótulo; a linha inteira escolhida fica guardada para os próximos blocos.</p>
            <Campo label="Lista (variável)" ajuda="Ex.: resposta.data — preenchido, ignora as opções fixas abaixo.">
              <Input className="font-mono" value={s("lista_origem")} placeholder="resposta.data" onChange={(e) => atualizar({ lista_origem: e.target.value })} />
            </Campo>
            {s("lista_origem").trim() && (
              <>
                <Campo label="O que o cliente vê" ajuda="Use os campos de cada linha, ex.: {{condominio}} ({{torre}} - Unidade {{unidade}})">
                  <Input className="font-mono" value={s("lista_rotulo")} placeholder="{{nome}}" onChange={(e) => atualizar({ lista_rotulo: e.target.value })} />
                </Campo>
                <Campo label="Guardar linha escolhida em" ajuda={`Depois use {{${s("guardar_em") || "item_escolhido"}.condominio_id}}, {{${s("guardar_em") || "item_escolhido"}.adm_id}}…`}>
                  <Input className="font-mono" value={s("guardar_em")} placeholder="item_escolhido" onChange={(e) => atualizar({ guardar_em: e.target.value })} />
                </Campo>
              </>
            )}
          </div>
          {!s("lista_origem").trim() && texto("Opções", "opcoes", "Uma opção por linha — cada uma vira uma saída. Pode usar {{variavel}} com várias linhas (máx. 10 na lista).")}
        </>
      );
    case "pergunta":
      return (
        <>
          {texto("Pergunta")}
          <Campo label="Guardar resposta em" ajuda="Pode ser a chave de um campo personalizado">
            <Input value={s("variavel")} onChange={(e) => atualizar({ variavel: e.target.value })} />
          </Campo>
        </>
      );
    case "condicao":
      return (
        <>
          <Campo label="Variável"><Input value={s("variavel")} onChange={(e) => atualizar({ variavel: e.target.value })} /></Campo>
          <Campo label="Operador">
            <Select value={s("operador")} onValueChange={(v) => atualizar({ operador: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="igual">É igual a</SelectItem>
                <SelectItem value="diferente">É diferente de</SelectItem>
                <SelectItem value="contem">Contém</SelectItem>
                <SelectItem value="nao_contem">Não contém</SelectItem>
                <SelectItem value="maior">Maior que (número)</SelectItem>
                <SelectItem value="maior_igual">Maior ou igual a (número)</SelectItem>
                <SelectItem value="menor">Menor que (número)</SelectItem>
                <SelectItem value="menor_igual">Menor ou igual a (número)</SelectItem>
                <SelectItem value="vazio">Está vazio</SelectItem>
                <SelectItem value="preenchido">Está preenchido</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Valor"><CampoFluxo linha value={s("valor")} onChange={(v) => atualizar({ valor: v })} /></Campo>
          <p className="text-xs text-muted-foreground">Se a regra for verdadeira segue pela saída <b>Sim</b>; senão (else) pela saída <b>Não</b>.</p>
        </>
      );
    case "switch":
      return (
        <>
          <Campo label="Variável" ajuda="Ex.: opcao, resposta.status"><Input value={s("variavel")} onChange={(e) => atualizar({ variavel: e.target.value })} /></Campo>
          <Campo label="Comparação">
            <Select value={s("operador") || "igual"} onValueChange={(v) => atualizar({ operador: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="igual">É igual a</SelectItem>
                <SelectItem value="contem">Contém</SelectItem>
                <SelectItem value="maior">Maior que (número)</SelectItem>
                <SelectItem value="maior_igual">Maior ou igual a (número)</SelectItem>
                <SelectItem value="menor">Menor que (número)</SelectItem>
                <SelectItem value="menor_igual">Menor ou igual a (número)</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Casos (um por linha)" ajuda="Cada linha vira uma saída no bloco. O primeiro caso verdadeiro vence; nenhum → saída Padrão.">
            <Textarea rows={5} value={s("casos")} onChange={(e) => atualizar({ casos: e.target.value })} />
          </Campo>
        </>
      );
    case "horario":
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Abre"><Input type="time" value={s("inicio")} onChange={(e) => atualizar({ inicio: e.target.value })} /></Campo>
            <Campo label="Fecha"><Input type="time" value={s("fim")} onChange={(e) => atualizar({ fim: e.target.value })} /></Campo>
          </div>
          <Campo label="Dias" ajuda="Ex.: seg,ter,qua,qui,sex"><Input value={s("dias")} onChange={(e) => atualizar({ dias: e.target.value })} /></Campo>
        </>
      );
    case "atraso":
      return <Campo label="Segundos"><Input type="number" min={1} value={s("segundos")} onChange={(e) => atualizar({ segundos: Number(e.target.value) })} /></Campo>;
    case "kanban": {
      const daQuadro = etapas
        .filter((e) => String(pick(e, ["kanban_nome_id", "kanban_id"]) ?? "") === s("quadro_id"))
        .sort((a, b) => Number(a["ordem"] ?? 0) - Number(b["ordem"] ?? 0));
      return (
        <>
          <Campo label="Quadro">
            <Select value={s("quadro_id")} onValueChange={(v) => atualizar({ quadro_id: v, etapa_id: "" })}>
              <SelectTrigger><SelectValue placeholder="Escolha o quadro" /></SelectTrigger>
              <SelectContent>
                {quadros.map((q) => <SelectItem key={String(q["id"])} value={String(q["id"])}>{pick<string>(q, ["nome", "descricao", "titulo"])}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Mover para a etapa">
            <Select value={s("etapa_id")} onValueChange={(v) => atualizar({ etapa_id: v })} disabled={!s("quadro_id")}>
              <SelectTrigger><SelectValue placeholder="Escolha a etapa" /></SelectTrigger>
              <SelectContent>
                {daQuadro.map((e) => (
                  <SelectItem key={String(e["id"])} value={String(e["id"])}>
                    <span className="flex items-center gap-2">
                      <span className={cn("size-2.5 rounded-full", corEtapa(e["cor"]).className)} />
                      {pick<string>(e, ["descricao", "nome", "titulo"])}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Prioridade">
            <Select value={s("prioridade") || "normal"} onValueChange={(v) => atualizar({ prioridade: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Atalho de entrada direta (#)" ajuda="Se a 1ª mensagem do cliente tiver esta #tag, o robô pula o início e começa neste bloco. Separe várias por vírgula. Vazio: usa o nome do quadro.">
            <Input
              value={s("atalho")}
              placeholder={`#${tagDoKanban(pick<string>(quadros.find((q) => String(q["id"]) === s("quadro_id")) ?? {}, ["nome", "descricao", "titulo"]) ?? "") || "oferta"}`}
              onChange={(e) => atualizar({ atalho: e.target.value })}
            />
          </Campo>
        </>
      );
    }
    case "atribuir":
      return (
        <>
          <Campo label="Como distribuir">
            <Select value={s("modo")} onValueChange={(v) => atualizar({ modo: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="roleta">Roleta entre atendentes</SelectItem>
                <SelectItem value="fila">Fila do departamento</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Departamento"><Input value={s("departamento")} onChange={(e) => atualizar({ departamento: e.target.value })} placeholder="Ex.: Suporte" /></Campo>
        </>
      );
    case "campo":
      return (
        <>
          <Campo label="Grupo de campos" ajuda="Filtra os campos pelo modelo (ex.: do Kanban Oferta). O valor fica gravado no contato da conversa.">
            <Select value={s("template") || "todos"} onValueChange={(v) => atualizar({ template: v, chave: "" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {[...new Set(campos.map((c) => String(c["template"] ?? "geral")))].sort().map((t) => <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Campo personalizado">
            <Select value={s("chave")} onValueChange={(v) => atualizar({ chave: v })}>
              <SelectTrigger><SelectValue placeholder="Escolha o campo" /></SelectTrigger>
              <SelectContent>
                {campos.filter((c) => !s("template") || s("template") === "todos" || String(c["template"] ?? "geral") === s("template")).sort((a, b) => String(a["label"] || a["chave"]).localeCompare(String(b["label"] || b["chave"]))).map((c) => <SelectItem key={String(c["id"])} value={String(c["chave"])}>{String(c["label"] || c["chave"])}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Valor" ajuda="Use {{variavel}} para gravar uma resposta do cliente"><CampoFluxo linha value={s("valor")} onChange={(v) => atualizar({ valor: v })} /></Campo>
        </>
      );
    case "subfluxo":
      return (
        <Campo label="Fluxo a executar" ajuda="A conversa continua a partir do início do fluxo escolhido, mantendo as respostas já coletadas.">
          <Select value={s("fluxo_id")} onValueChange={(v) => atualizar({ fluxo_id: v })}>
            <SelectTrigger><SelectValue placeholder="Escolha o fluxo" /></SelectTrigger>
            <SelectContent>
              {fluxos.map((f) => <SelectItem key={String(f["id"])} value={String(f["id"])}>{String(f["nome"])}{f["ativo"] ? "" : " (inativo)"}</SelectItem>)}
            </SelectContent>
          </Select>
        </Campo>
      );
    case "ia":
      return <IaPropriedades d={d} atualizar={atualizar} />;
    default:
      return null;
  }
}
