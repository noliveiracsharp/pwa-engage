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
  MessageCircleQuestion, PhoneForwarded, Plus, Save, Trash2, UserPlus, Workflow, Zap, PenLine, CircleStop, Globe, Code2, X, FlaskConical, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { pick, type Row } from "@/lib/row";
import { corEtapa } from "@/lib/kanban-cores";
import { IaPropriedades } from "@/components/fluxos/IaPropriedades";
import { SimuladorFluxo } from "@/components/fluxos/SimuladorFluxo";
import {
  CATALOGO, dadosPadrao, nomeTipo, resumoNo, saidasDoNo, temEntrada,
  type CategoriaNo, type DadosNo, type TipoNo,
} from "@/lib/fluxos";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { createContext, useContext } from "react";
import { CampoVariaveis } from "@/components/ui/campo-variaveis";
import type { VariavelDef } from "@/lib/variaveis";

const VARS_CONTATO: VariavelDef[] = [
  { chave: "nome", descricao: "Nome do contato" },
  { chave: "telefone", descricao: "Telefone do contato" },
  { chave: "email", descricao: "E-mail do contato" },
  { chave: "protocolo", descricao: "Protocolo do atendimento" },
  { chave: "ultima_mensagem", descricao: "Última mensagem do cliente" },
];
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
function CampoFluxo({ value, onChange, linha, rows, mono }: { value: string; onChange: (v: string) => void; linha?: boolean; rows?: number; mono?: boolean }) {
  const { vars, empresaId } = useContext(VarsCtx);
  return <CampoVariaveis value={value} onChange={onChange} variaveis={vars} empresaId={empresaId ?? undefined} linha={!!linha} rows={rows ?? 4} campoClassName={mono ? "font-mono text-xs" : ""} />;
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
  condicao: GitBranch, horario: Clock, atraso: Hourglass, kanban: KanbanSquare, atribuir: UserPlus,
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
            aria-label="Excluir bloco"
            title="Excluir bloco"
            className="nodrag flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
            onClick={(e) => { e.stopPropagation(); void deleteElements({ nodes: [{ id }] }); }}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
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
  const removerSel = () => {
    if (!sel || sel.data.tipo === "gatilho") return;
    setNodes((ns) => ns.filter((n) => n.id !== selId));
    setEdges((es) => es.filter((e) => e.source !== selId && e.target !== selId));
    setSelId(null);
  };

  const categorias = useMemo(() => Array.from(new Set(CATALOGO.map((c) => c.categoria))), []);
  const [testando, setTestando] = useState(false);
  const [trilhaTeste, setTrilhaTeste] = useState<{ visitados: string[]; atual: string | null }>({ visitados: [], atual: null });
  const nosVisiveis = useMemo(() => {
    if (!trilhaTeste.visitados.length && !trilhaTeste.atual) return nodes;
    const vis = new Set(trilhaTeste.visitados);
    return nodes.map((n) => ({
      ...n,
      className: n.id === trilhaTeste.atual ? "rounded-lg ring-4 ring-warning animate-pulse" : vis.has(n.id) ? "rounded-lg ring-2 ring-success" : "opacity-60",
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
          <aside className="hidden w-56 shrink-0 space-y-3 overflow-y-auto rounded-lg border bg-card p-2 md:block">
            {categorias.map((cat) => (
              <div key={cat}>
                <p className="px-1 pb-1 text-[11px] font-semibold uppercase text-muted-foreground">{cat}</p>
                {CATALOGO.filter((c) => c.categoria === cat && c.tipo !== "gatilho").map((c) => {
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
          <div className="relative min-w-0 flex-1 overflow-hidden rounded-lg border bg-muted/30" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
            {fluxo ? (
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
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <Workflow className="size-10" />
                Crie seu primeiro fluxo para começar a montar o atendimento automático.
                <Button size="sm" onClick={novoFluxo}><Plus className="size-4" /> Novo fluxo</Button>
              </div>
            )}
          </div>
        </div>
      )}

      <SimuladorFluxo
        open={testando} onOpenChange={setTestando}
        nos={nodes as unknown as import("@/lib/fluxos-motor").NoFluxo[]}
        conexoes={edges.map((e) => ({ source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? null }))}
        onTrilha={(visitados, atual) => setTrilhaTeste({ visitados, atual })}
      />
      <Sheet open={!!sel} onOpenChange={(o) => !o && setSelId(null)}>
        <SheetContent side="right" className="flex flex-col">
          {sel && (
            <>
              <SheetHeader>
                <SheetTitle>{nomeTipo(sel.data.tipo)}</SheetTitle>
                <SheetDescription>{CATALOGO.find((c) => c.tipo === sel.data.tipo)?.descricao}</SheetDescription>
              </SheetHeader>
              <div className="flex-1 space-y-4 overflow-y-auto px-4">
                <Campo label="Título do bloco">
                  <Input value={String(sel.data.titulo ?? "")} placeholder={nomeTipo(sel.data.tipo)} onChange={(e) => atualizarSel({ titulo: e.target.value })} />
                </Campo>
                <VarsCtx.Provider value={{ vars: variaveisDoFluxo(nodes as FluxoNode[]), empresaId }}><Propriedades no={sel} atualizar={atualizarSel} quadros={quadros} etapas={etapas} campos={campos} fluxos={fluxos.filter((f) => String(f["id"]) !== fluxoId)} /></VarsCtx.Provider>
              </div>
              <SheetFooter className="flex-row justify-between border-t">
                <Button variant="ghost" onClick={removerSel} disabled={sel.data.tipo === "gatilho"}><Trash2 className="size-4" /> Excluir bloco</Button>
                <Button onClick={() => setSelId(null)}>Concluir</Button>
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

function MidiaMensagem({ d, atualizar }: { d: DadosNo; atualizar: (p: DadosNo) => void }) {
  const { empresaId } = useContext(VarsCtx);
  const [subindo, setSubindo] = useState(false);
  const tipo = String(d["midia_tipo"] || "nenhuma");
  const url = String(d["midia_url"] ?? "");
  const subir = async (file: File) => {
    setSubindo(true);
    const path = `${empresaId ?? "geral"}/fluxos/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("chat_media").upload(path, file, file.type ? { contentType: file.type } : undefined);
    setSubindo(false);
    if (up.error) return void toast.error(`Não foi possível enviar o arquivo: ${up.error.message}`);
    const t = file.type.startsWith("image/") ? "imagem" : file.type.startsWith("video/") ? "video" : "documento";
    atualizar({ midia_url: supabase.storage.from("chat_media").getPublicUrl(path).data.publicUrl, midia_tipo: t, midia_nome: file.name });
  };
  return (
    <>
      <Campo label="Anexar mídia">
        <Select value={tipo} onValueChange={(v) => atualizar(v === "nenhuma" ? { midia_tipo: "", midia_url: "", midia_nome: "" } : { midia_tipo: v })}>
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
        <>
          <Campo label="Arquivo" ajuda="Envie o arquivo ou cole um endereço público. Aceita variáveis, ex.: {{foto}}. Vídeos até 16 MB.">
            <div className="flex gap-2">
              <CampoFluxo linha mono value={url} onChange={(v) => atualizar({ midia_url: v })} />
              <Button type="button" variant="outline" size="icon" disabled={subindo} asChild>
                <label aria-label="Enviar arquivo" className="cursor-pointer">
                  <Upload className="size-4" />
                  <input type="file" className="hidden" accept={tipo === "imagem" ? "image/*" : tipo === "video" ? "video/*" : undefined}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f); e.target.value = ""; }} />
                </label>
              </Button>
            </div>
          </Campo>
          {subindo && <p className="text-xs text-muted-foreground">Enviando arquivo…</p>}
          {url.startsWith("http") && tipo === "imagem" && <img src={url} alt="" className="max-h-40 rounded border" />}
          {url.startsWith("http") && tipo === "video" && <video src={url} controls className="max-h-40 rounded border" />}
        </>
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
      return <>{texto("Mensagem")}{texto("Opções", "opcoes", "Uma opção por linha — cada uma vira uma saída do bloco")}</>;
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
                <SelectItem value="contem">Contém</SelectItem>
                <SelectItem value="vazio">Está vazio</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Valor"><CampoFluxo linha value={s("valor")} onChange={(v) => atualizar({ valor: v })} /></Campo>
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
          <Campo label="Campo personalizado">
            <Select value={s("chave")} onValueChange={(v) => atualizar({ chave: v })}>
              <SelectTrigger><SelectValue placeholder="Escolha o campo" /></SelectTrigger>
              <SelectContent>
                {campos.map((c) => <SelectItem key={String(c["id"])} value={String(c["chave"])}>{String(c["label"] || c["chave"])}</SelectItem>)}
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
