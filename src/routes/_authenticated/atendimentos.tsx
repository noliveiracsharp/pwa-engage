import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useKanbansPermitidos } from "@/hooks/useKanbansPermitidos";
import { ProtocoloBadge } from "@/components/atendimentos/ProtocoloBadge";
import { lazy, Suspense, type ComponentType, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NovoAtendimentoDialog } from "@/components/atendimentos/NovoAtendimentoDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTableRows, rowId, text } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChatPainel } from "@/components/atendimentos/ChatPainel";
import { ContatoPainel } from "@/components/atendimentos/ContatoPainel";
import { BloqueiosDialog, SeloBloqueado, useBloqueados } from "@/components/atendimentos/Bloqueios";
import { Ban } from "lucide-react";
import {
  A, M, corEtiqueta, dataDe, fotoPessoa, horaCurta, iniciais, isCliente, isEncerrado, isIA, nomePessoa, telefonePessoa,
} from "@/lib/atendimentos";
import { AvaliacaoSelo } from "@/components/atendimentos/Pesquisa";
import { BuscaAtendimentosDialog } from "@/components/atendimentos/BuscaAtendimentosDialog";

export const Route = createFileRoute("/_authenticated/atendimentos")({
  staticData: { sitemap: false },
  validateSearch: (search: Record<string, unknown>): { id?: string | undefined; novo?: string | undefined } => ({
    id: typeof search["id"] === "string" ? search["id"] : undefined,
    ...(search["novo"] === "1" || search["novo"] === 1 ? { novo: "1" } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Atendimentos — ConectCon HUB" },
      { name: "description", content: "Converse com as pessoas em um chat multicanal." },
      { property: "og:title", content: "Atendimentos — ConectCon HUB" },
      { property: "og:description", content: "Converse com as pessoas em um chat multicanal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AtendimentosPage,
});

type Rapido = "todos" | "historico" | "minhas" | "aguardando" | "ia" | "encerrados";
const RAPIDOS_BASE: { key: Rapido; label: string }[] = [
  { key: "minhas", label: "Ativos" },
  { key: "aguardando", label: "Aguardando" },
  { key: "ia", label: "Leads / IA" },
];
type Sub = "todas" | "naolidas" | "grupos";
const SUBS: { key: Sub; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "naolidas", label: "Não lidas" },
  { key: "grupos", label: "Grupos" },
];
const DIAS_LISTA = 90;
/** Busca linhas cujo `col` está em `ids`, em lotes (evita URLs gigantes e downloads da tabela inteira). */
async function porIds(table: string, col: string, ids: string[], select = "*"): Promise<Row[]> {
  const out: Row[] = [];
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += 150) lotes.push(ids.slice(i, i + 150));
  const res = await Promise.all(lotes.map((l) => supabase.from(table).select(select).in(col, l)));
  for (const r of res) { if (r.error) throw r.error; out.push(...((r.data ?? []) as unknown as Row[])); }
  return out;
}
const chaveIds = (ids: string[]) => { let h = 0; const s = [...ids].sort().join(","); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return `${ids.length}:${h}`; };
const naoLidasDe = (a: Row) => { const c = A.naoLidas.find((k) => k in a); return c ? Number(a[c]) || 0 : 0; };

const byId = (rows: Row[]) => new Map(rows.map((r) => [text(rowId(r)), r]));

const DashboardAba = lazy(() => import("@/routes/_authenticated/atendimentos_.dashboard").then((m) => ({ default: m.Route.options.component as ComponentType })));

/** Gestores veem as abas Atendimentos | Dashboard; o Dashboard só carrega ao abrir a aba. */
function AtendimentosPage() {
  const { isMaster } = useAuth();
  const perm = usePagePermissions("/atendimentos/gerencial");
  const gerencial = perm.canRead || isMaster;
  const [aba, setAba] = useState<"chat" | "dash">("chat");
  if (!gerencial) return <AtendimentosChat />;
  const btn = (k: "chat" | "dash", label: string) => (
    <button type="button" onClick={() => setAba(k)} aria-pressed={aba === k}
      className={cn("rounded-md px-3 py-1 text-sm transition-colors", aba === k ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
      {label}
    </button>
  );
  return (
    <div className="flex flex-col">
      <div className="-mx-4 -mt-4 mb-4 flex border-b border-border bg-card px-3 py-1.5 sm:-mx-6 sm:-mt-6">
        <div className="inline-flex gap-1 rounded-lg bg-muted p-1">{btn("chat", "Atendimentos")}{btn("dash", "Dashboard")}</div>
      </div>
      {aba === "chat" ? <AtendimentosChat comAbas /> : (
        <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}><DashboardAba /></Suspense>
      )}
    </div>
  );
}

function AtendimentosChat({ comAbas = false }: { comAbas?: boolean }) {
  const { id } = Route.useSearch();
  const navigate = useNavigate();
  const { isMaster, usuario, empresa } = useAuth();
  const usuarioId = usuario ? text(rowId(usuario)) : "";
  const empresaId = empresa ? text(rowId(empresa)) : "";

  // Só conversas recentes (últimos dias) — o histórico inteiro deixava a entrada lenta.
  const filtroRecentes = useMemo(() => {
    const d = new Date(Date.now() - DIAS_LISTA * 864e5).toISOString();
    return { key: `recentes-${d.slice(0, 10)}`, apply: (q: any) => q.gte("created_at", d) }; // eslint-disable-line @typescript-eslint/no-explicit-any
  }, []);
  // Painel em 1 chamada (função fn_atendimentos_painel): conversa + contato + última mensagem já juntos.
  const { data: painelRpc, isLoading: carregandoRpc } = useQuery({
    queryKey: ["table", "atendimentos", "painel", empresaId || "todas"],
    staleTime: 30_000,
    queryFn: async (): Promise<Row[] | null> => {
      // Só o que está em andamento (ativos, aguardando, IA); encerrados vêm pela busca.
      const at = await supabase.rpc("fn_atendimentos_ativos" as never, { p_empresa_id: empresaId || null } as never);
      if (!at.error) return (at.data ?? []) as unknown as Row[];
      const { data, error } = await supabase.rpc("fn_atendimentos_painel" as never, { p_empresa_id: empresaId || null, p_dias: DIAS_LISTA } as never);
      if (error) return null; // função ainda não criada: usa o caminho antigo
      return (data ?? []) as unknown as Row[];
    },
  });
  const usaRpc = Array.isArray(painelRpc);
  const { data: atendLegado = [], isLoading: carregandoLeg } = useTableRows("atendimentos", painelRpc === null, undefined, filtroRecentes);
  const [escolhidos, setEscolhidos] = useState<Row[]>([]);
  const atendimentos = useMemo(() => {
    const base = usaRpc ? painelRpc : atendLegado;
    const ids = new Set(base.map((a) => text(rowId(a))));
    return [...base, ...escolhidos.filter((e) => !ids.has(text(rowId(e))))];
  }, [usaRpc, painelRpc, atendLegado, escolhidos]);
  const isLoading = carregandoRpc || (!usaRpc && carregandoLeg);
  const atIds = useMemo(() => atendimentos.map((a) => text(rowId(a))).filter(Boolean), [atendimentos]);
  const pesIds = useMemo(() => [...new Set(atendimentos.map((a) => text(pick(a, A.pessoa))).filter(Boolean))], [atendimentos]);
  const [novoAberto, setNovoAberto] = useState(false);
  // Contatos: só os das conversas carregadas; a tabela inteira só ao abrir "Iniciar Atendimento".
  const { data: pessoasLista = [] } = useQuery({
    queryKey: ["table", "pessoas", "ids", chaveIds(pesIds)],
    enabled: !usaRpc && pesIds.length > 0,
    staleTime: 60_000,
    queryFn: () => porIds("pessoas", "id", pesIds),
  });
  const { data: pessoasTodas = [] } = useTableRows("pessoas", novoAberto);
  const pessoasRpc = useMemo(() => usaRpc ? atendimentos.map((a) => a["_pessoa"] as Row | null).filter((p): p is Row => !!p) : [], [usaRpc, atendimentos]);
  const pessoas = novoAberto && pessoasTodas.length ? pessoasTodas : usaRpc ? pessoasRpc : pessoasLista;
  const { data: instancias = [] } = useTableRows("empresas_instancias");
  const { data: allKanbans = [] } = useTableRows("kanban_nome");
  const { data: etapas = [] } = useTableRows("kanban_etapas");
  const { data: etiquetas = [] } = useTableRows("etiquetas");
  const { data: vincEt = [] } = useQuery({
    queryKey: ["table", "atendimentos_etiqueta", "ids", chaveIds(atIds)],
    enabled: atIds.length > 0,
    queryFn: () => porIds("atendimentos_etiqueta", "atendimento_id", atIds),
  });
  const { data: participantes = [] } = useQuery({
    queryKey: ["table", "atendimentos_participantes", "ids", chaveIds(atIds)],
    enabled: atIds.length > 0,
    queryFn: () => porIds("atendimentos_participantes", "atendimento_id", atIds),
  });
  const { data: usuarios = [] } = useTableRows("usuarios");
  const { data: notas = [] } = useTableRows("empresas_notasrapidas");
  const qcLista = useQueryClient();
  // Lista ao vivo: novos chamados e transferências aparecem sem recarregar.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const ch = supabase.channel("at-lista").on("postgres_changes", { event: "*", schema: "public", table: "atendimentos" }, () => {
      clearTimeout(t);
      t = setTimeout(() => { void qcLista.invalidateQueries({ queryKey: ["table", "atendimentos"], exact: false }); }, 400);
    }).subscribe();
    return () => { clearTimeout(t); void supabase.removeChannel(ch); };
  }, [qcLista]);
  

  const { data: meusKanbans = [] } = useQuery({
    queryKey: ["table", "usuario_kanban", usuarioId],
    enabled: false && !!usuarioId && !isMaster,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from("usuario_kanban").select("kanban_nome_id").eq("usuario_id", usuarioId);
      if (error) throw error;
      return ((data ?? []) as Row[]).map((r) => text(r["kanban_nome_id"]));
    },
  });

  // Última mensagem de cada conversa.
  const { data: ultimasLeg = new Map<string, Row>() } = useQuery({
    queryKey: ["table", "atendimentos_mensagem", "ultimas"],
    enabled: painelRpc === null,
    queryFn: async () => {
      let { data, error } = await supabase.from("atendimentos_mensagem").select("atendimento_id, mensagem, msg_interna, usuario_id, remetente_tipo, created_at").eq("oculta_para_atendente", false).order("created_at", { ascending: false }).limit(800);
      if (error) ({ data } = await supabase.from("atendimentos_mensagem").select("*").eq("oculta_para_atendente", false).order("created_at", { ascending: false }).limit(800));
      const map = new Map<string, Row>();
      for (const m of (data ?? []) as Row[]) {
        const k = text(pick(m, M.atendimento));
        if (!map.has(k)) map.set(k, m);
      }
      return map;
    },
  });

  const ultimas = useMemo(() => {
    if (!usaRpc) return ultimasLeg;
    const map = new Map<string, Row>();
    for (const a of atendimentos) { const m = a["_ultima"] as Row | null; if (m) map.set(text(rowId(a)), m); }
    return map;
  }, [usaRpc, atendimentos, ultimasLeg]);
  const acessoKb = useKanbansPermitidos();
  void meusKanbans;
  const kanbans = useMemo(() => {
    if (isMaster) return allKanbans;
    return allKanbans.filter((k) => acessoKb.pode(rowId(k)));
  }, [isMaster, allKanbans, acessoKb]);

  // Transferência: qualquer atendente pode enviar a conversa para outro departamento ativo da empresa (ex.: Suporte).
  const kanbansDestino = useMemo(
    () =>
      allKanbans
        .filter((k) => k["status"] !== false)
        .filter((k) => { const e = pick(k, ["empresa_id", "id_empresa"]); return !empresaId || e === undefined || e === null || text(e) === empresaId; })
        .sort((a, b) => text(pick(a, ["nome", "descricao"])).localeCompare(text(pick(b, ["nome", "descricao"])), "pt-BR")),
    [allKanbans, empresaId],
  );

  const instanciasAtivas = useMemo(
    () => instancias.filter((i) => i["status"] !== false && String(i["finalidade"] ?? "").toLowerCase() !== "notificacoes" && (!empresaId || !("empresa_id" in i) || text(i["empresa_id"]) === empresaId)),
    [instancias, empresaId],
  );

  const [instFiltro, setInstFiltro] = useState("todas");
  const [depFiltro, setDepFiltro] = useState("todos");
  const gerencial = usePagePermissions("/atendimentos/gerencial").canRead || isMaster;
  const RAPIDOS = RAPIDOS_BASE;
  const EXTRAS = useMemo(() => [{ key: "encerrados" as Rapido, label: "Encerrados" }, gerencial ? { key: "todos" as Rapido, label: "Todos" } : { key: "historico" as Rapido, label: "Histórico" }], [gerencial]);
  const [sub, setSub] = useState<Sub>("todas");
  const [rapido, setRapido] = useState<Rapido>("minhas");
  useEffect(() => { if (!gerencial && rapido === "todos") setRapido("historico"); if (gerencial && rapido === "historico") setRapido("todos"); }, [gerencial, rapido]);
  const [busca, setBusca] = useState("");
  const [buscaModo, setBuscaModo] = useState<"encerrados" | "todos" | "historico" | null>(null);
  const [painel, setPainel] = useState(true);
  const [listaAberta, setLista] = useState(true);
  const [bloqAberto, setBloqAberto] = useState(false);
  const empresaBloq = empresaId;
  const bloqueioDe = useBloqueados(empresaId);
  const { novo: novoSearch } = Route.useSearch();
  const navAt = Route.useNavigate();
  useEffect(() => {
    if (novoSearch !== "1") return;
    setNovoAberto(true);
    void navAt({ search: (s: Record<string, unknown>) => ({ ...s, novo: undefined }), replace: true } as never);
  }, [novoSearch]);

  const pessoasMap = useMemo(() => byId(pessoas), [pessoas]);
  const instMap = useMemo(() => byId(instancias), [instancias]);
  // Canal único: já vem selecionado.
  useEffect(() => {
    if (instanciasAtivas.length === 1 && instFiltro === "todas") setInstFiltro(text(rowId(instanciasAtivas[0]!)));
  }, [instanciasAtivas, instFiltro]);
  const etMap = useMemo(() => byId(etiquetas), [etiquetas]);
  const kbMap = useMemo(() => byId(allKanbans), [allKanbans]);
  const autores = useMemo(
    () => new Map(usuarios.map((u) => [text(rowId(u)), text(pick(u, ["nome", "name", "email"])).split(" ")[0] ?? ""])),
    [usuarios],
  );

  const meuParticipa = useMemo(() => new Set(participantes.filter((x) => text(x["usuario_id"]) === usuarioId).map((x) => text(x["atendimento_id"]))), [participantes, usuarioId]);
  const visiveis = useMemo(() => {
    const permitidos = new Set(kanbans.map((k) => text(rowId(k))));
    return atendimentos.filter((a) => isMaster || permitidos.has(text(pick(a, A.kanban))) || text(pick(a, A.responsavel)) === usuarioId);
  }, [atendimentos, kanbans, isMaster, usuarioId]);
  function naAba(a: Row, aba: Rapido) {
    const enc = isEncerrado(a, etapas);
    if (aba === "encerrados") return enc;
    if (aba === "historico") return text(pick(a, A.responsavel)) === usuarioId || meuParticipa.has(text(rowId(a)));
    if (enc) return false; // Encerrados só aparecem nas abas "Encerrados"/"Histórico".
    if (aba === "minhas") return !!usuarioId && text(pick(a, A.responsavel)) === usuarioId;
    if (aba === "aguardando") return !isIA(a) && !text(pick(a, A.responsavel));
    if (aba === "ia") return isIA(a);
    return true;
  }
  // Selos: conversas com mensagens novas (não lidas) em cada aba; em "Aguardando", toda conversa sem atendente.
  const selos = useMemo(() => {
    const m = new Map<Rapido, number>();
    for (const r of RAPIDOS) {
      if (r.key === "encerrados" || r.key === "historico") continue;
      m.set(r.key, visiveis.filter((a) => naAba(a, r.key) && (r.key === "aguardando" || naoLidasDe(a) > 0)).length);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiveis, etapas, usuarioId, meuParticipa]);

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return visiveis
      .filter((a) => instFiltro === "todas" || text(pick(a, A.instancia)) === instFiltro)
      .filter((a) => depFiltro === "todos" || text(pick(a, A.kanban)) === depFiltro)
      .filter((a) => naAba(a, rapido))
      .filter((a) => sub === "todas" || (sub === "naolidas" ? naoLidasDe(a) > 0 : pessoasMap.get(text(pick(a, A.pessoa)))?.["is_group"] === true))
      .filter((a) => {
        if (!termo) return true;
        const p = pessoasMap.get(text(pick(a, A.pessoa)));
        const digitos = termo.replace(/\D/g, "");
        const alvo = `${nomePessoa(p)} ${telefonePessoa(p)} ${text(a["protocolo"])}`.toLowerCase();
        return alvo.includes(termo) || (digitos.length >= 3 && alvo.replace(/\D/g, "").includes(digitos));
      })
      .map((a) => {
        const ult = ultimas.get(text(rowId(a)));
        return { a, ult, quando: dataDe(ult, M.data) ?? dataDe(a, A.data) };
      })
      .sort((x, y) => (y.quando?.getTime() ?? 0) - (x.quando?.getTime() ?? 0));
  }, [atendimentos, etapas, kanbans, isMaster, usuarioId, instFiltro, depFiltro, rapido, sub, busca, pessoasMap, participantes, ultimas, visiveis, meuParticipa]);

  const ativo = atendimentos.find((a) => text(rowId(a)) === id);
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) setPainel(false);
  }, []);
  const abrir = (aid?: string) => navigate({ to: "/atendimentos", search: { id: aid }, replace: true });

  return (
    <div className={cn("flex overflow-hidden border-border bg-card", comAbas ? "-mx-4 -mb-4 -mt-4 h-[calc(100vh-7rem)] sm:-mx-6 sm:-mb-6" : "-m-4 h-[calc(100vh-4rem)] sm:-m-6")}>
      {/* Coluna 1 */}
      <aside className={cn("flex w-full flex-col border-r border-border md:w-80 lg:w-96", ativo && (listaAberta ? "hidden md:flex" : "hidden"))}>
        <div className="space-y-2 border-b border-border p-3">
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setNovoAberto(true)}>
              <Plus className="mr-1 h-4 w-4" /> Iniciar Atendimento
            </Button>
            <Button variant="outline" size="icon" className="shrink-0" onClick={() => setBloqAberto(true)} aria-label="Contatos bloqueados" title="Contatos bloqueados">
              <Ban className="h-4 w-4" />
            </Button>
            <BloqueiosDialog open={bloqAberto} onOpenChange={setBloqAberto} empresaId={empresaBloq} />
            {ativo && (
              <Button variant="outline" size="icon" className="hidden shrink-0 md:inline-flex" onClick={() => setLista(false)} aria-label="Ocultar conversas" title="Ocultar conversas">
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            )}
          </div>
          <NovoAtendimentoDialog
            open={novoAberto}
            onOpenChange={setNovoAberto}
            instancias={instanciasAtivas}
            kanbans={kanbans}
            etapas={etapas}
            pessoas={pessoas}
            etiquetas={etiquetas}
            onCriado={(aid) => abrir(aid)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Select value={instFiltro} onValueChange={setInstFiltro}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Instância" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as instâncias</SelectItem>
                {instanciasAtivas.map((i) => (
                  <SelectItem key={text(rowId(i))} value={text(rowId(i))}>
                    {text(pick(i, ["nome", "descricao"]))}
                    {pick(i, ["telefone", "numero"]) ? ` · ${text(pick(i, ["telefone", "numero"]))}` : ""}
                    {pick(i, ["tipo"]) ? ` (${text(i["tipo"])})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={depFiltro} onValueChange={setDepFiltro}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Departamento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os departamentos</SelectItem>
                {kanbans.map((k) => (
                  <SelectItem key={text(rowId(k))} value={text(rowId(k))}>{text(pick(k, ["nome", "descricao"]))}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {buscaModo && (
            <BuscaAtendimentosDialog open onOpenChange={(v) => { if (!v) setBuscaModo(null); }} empresaId={empresaId} modo={buscaModo} usuarioId={usuarioId}
              onEscolher={(row) => { setEscolhidos((l) => [row, ...l.filter((x) => text(rowId(x)) !== text(rowId(row)))]); abrir(text(rowId(row))); }} />
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, telefone ou protocolo" className="h-9 pl-8" />
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Situação das conversas">
            {RAPIDOS.map((r) => (
              <button key={r.key} type="button" role="tab" aria-selected={rapido === r.key} onClick={() => setRapido(r.key)}
                className={cn("flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors",
                  rapido === r.key ? "bg-background font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                <span className="truncate">{r.label}</span>
                {(selos.get(r.key) ?? 0) > 0 && (
                  <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground" aria-label={`${selos.get(r.key)} novas`}>
                    {selos.get(r.key)}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {SUBS.map((x) => (
              <button key={x.key} type="button" aria-pressed={sub === x.key} onClick={() => setSub(x.key)}
                className={cn("rounded-full px-3 py-1 text-xs transition-colors", sub === x.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>
                {x.label}
              </button>
            ))}
            <div className="ml-auto flex gap-1">
              {EXTRAS.map((x) => (
                <button key={x.key} type="button" onClick={() => setBuscaModo(x.key as "encerrados" | "todos" | "historico")}
                  className="rounded-full px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
                  {x.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading && <p className="p-6 text-center text-sm text-muted-foreground">Carregando conversas…</p>}
          {!isLoading && lista.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma conversa encontrada.</p>}
          {lista.map(({ a, ult, quando }) => {
            const aid = text(rowId(a));
            const p = pessoasMap.get(text(pick(a, A.pessoa)));
            const nome = nomePessoa(p);
            const inst = instMap.get(text(pick(a, A.instancia)));
            const naoLidas = Number(pick(a, A.naoLidas) ?? 0);
            const ets = vincEt.filter((v) => text(v["atendimento_id"]) === aid).map((v) => etMap.get(text(pick(v, ["etiqueta_id", "etiquetas_id"])))).filter(Boolean) as Row[];
            const interna = ult?.["msg_interna"] === true;
            const enc = isEncerrado(a, etapas);
            let autorUlt = "";
            if (ult) {
              if (isCliente(ult)) autorUlt = nome.split(" ")[0] ?? "";
              else {
                const uid = text(pick(ult, M.usuario));
                if (uid && uid === usuarioId) autorUlt = "Você";
                else if (uid) autorUlt = autores.get(uid) || "Equipe";
                else autorUlt = /ia|bot/i.test(text(pick(ult, ["remetente_tipo"]))) ? "IA" : "Sistema";
              }
            }
            return (
              <button
                key={aid}
                type="button"
                onClick={() => abrir(aid)}
                className={cn("flex w-full gap-3 border-b border-border px-3 py-3 text-left transition-colors hover:bg-accent/60", aid === id && "bg-accent")}
              >
                <Avatar className="h-11 w-11 shrink-0">
                  {fotoPessoa(p) && <AvatarImage src={fotoPessoa(p)} alt={nome} />}
                  <AvatarFallback>{iniciais(nome)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1 font-medium text-foreground">{p?.["is_group"] === true && <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Grupo" />}<span className="truncate">{nome}</span><ProtocoloBadge compacto protocolo={a["protocolo"]} /></p>
                    <span className={cn("shrink-0 text-[11px]", naoLidas > 0 ? "text-primary" : "text-muted-foreground")}>{horaCurta(quando)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1 truncate text-sm text-muted-foreground">
                      {isIA(a) && <Bot className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      <span className="truncate">
                        {autorUlt && <span className="font-medium text-foreground/80">{autorUlt}: </span>}
                        {ult ? (interna ? "📝 Nota interna" : text(pick(ult, M.texto)) || "Mídia") : (() => { const r = text(pick(a, A.responsavel)); return r ? (r === usuarioId ? "Com você" : `Com ${autores.get(r) || "atendente"}`) : "Aguardando atendente"; })()}
                      </span>
                    </p>
                    {naoLidas > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{naoLidas}</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {(() => { const k = kbMap.get(text(pick(a, A.kanban))); if (!k) return null; const cor = text(pick(k, ["cor_hex", "cor"])); return (
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", !cor && "bg-secondary text-secondary-foreground")} style={cor ? { backgroundColor: cor, color: "white" } : undefined}>
                        {text(pick(k, ["nome", "descricao"]))}
                      </span>); })()}
                    {inst && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{text(pick(inst, ["nome", "descricao"]))}</Badge>}
                    {(() => { const b = bloqueioDe(telefonePessoa(p)); return b ? <SeloBloqueado motivo={b.motivo} /> : null; })()}
                    {enc && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">Encerrado</Badge>}
                    {enc && <AvaliacaoSelo atendimento={a} encerrado />}
                    {ets.map((e) => (
                      <span key={text(rowId(e))} className="rounded-full px-1.5 py-0.5 text-[10px] text-white" style={{ backgroundColor: corEtiqueta(e) }}>
                        {text(pick(e, ["descricao", "nome"]))}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {ativo && !listaAberta && (
        <button type="button" onClick={() => setLista(true)} aria-label="Mostrar conversas" title="Mostrar conversas"
          className="hidden w-10 shrink-0 flex-col items-center gap-2 border-r border-border bg-card pt-3 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:flex">
          <PanelLeftOpen className="h-5 w-5" />
          <span className="text-[11px] font-medium [writing-mode:vertical-rl]">Conversas</span>
        </button>
      )}

      {/* Coluna 2 */}
      {ativo ? (
        <ChatPainel
          atendimento={ativo}
          pessoa={pessoasMap.get(text(pick(ativo, A.pessoa)))}
          instancia={instMap.get(text(pick(ativo, A.instancia)))}
          kanbans={kanbansDestino}
          etapas={etapas}
          notas={notas}
          painelAberto={painel}
          onTogglePainel={() => setPainel((v) => !v)}
          onVoltar={() => abrir(undefined)}
        />
      ) : (
        <div className="hidden flex-1 flex-col items-center justify-center gap-3 bg-background text-muted-foreground md:flex">
          <MessageSquare className="h-12 w-12" />
          <p>Selecione uma conversa para começar.</p>
        </div>
      )}

      {/* Coluna 3 */}
      {ativo && painel && (
        <div className="fixed inset-0 z-40 flex bg-card md:static md:z-auto">
          <ContatoPainel
            atendimento={ativo}
            pessoa={pessoasMap.get(text(pick(ativo, A.pessoa)))}
            usuarios={usuarios}
            participantes={participantes}
            etiquetas={etiquetas}
            vinculosEtiqueta={vincEt}
            kanbans={kanbans}
            etapas={etapas}
            kanbansDestino={kanbansDestino}
            instancia={instMap.get(text(pick(ativo, A.instancia)))}
            onFechar={() => setPainel(false)}
          />
        </div>
      )}
    </div>
  );
}
