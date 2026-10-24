import { useKanbansPermitidos } from "@/hooks/useKanbansPermitidos";
import { ProtocoloBadge } from "@/components/atendimentos/ProtocoloBadge";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
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
import {
  A, M, corEtiqueta, dataDe, fotoPessoa, horaCurta, iniciais, isCliente, isEncerrado, isIA, nomePessoa, telefonePessoa,
} from "@/lib/atendimentos";
import { AvaliacaoSelo } from "@/components/atendimentos/Pesquisa";

export const Route = createFileRoute("/_authenticated/atendimentos")({
  staticData: { sitemap: false },
  validateSearch: (search: Record<string, unknown>): { id?: string | undefined; novo?: string | undefined } => ({
    id: typeof search["id"] === "string" ? search["id"] : undefined,
    ...(search["novo"] === "1" || search["novo"] === 1 ? { novo: "1" } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Atendimentos — Atende.ai" },
      { name: "description", content: "Converse com as pessoas em um chat multicanal." },
      { property: "og:title", content: "Atendimentos — Atende.ai" },
      { property: "og:description", content: "Converse com as pessoas em um chat multicanal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AtendimentosPage,
});

type Rapido = "todos" | "minhas" | "aguardando" | "ia" | "encerrados";
const RAPIDOS: { key: Rapido; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "minhas", label: "Minhas conversas" },
  { key: "aguardando", label: "Aguardando" },
  { key: "ia", label: "Pela IA" },
  { key: "encerrados", label: "Encerrados" },
];

const byId = (rows: Row[]) => new Map(rows.map((r) => [text(rowId(r)), r]));

function AtendimentosPage() {
  const { id } = Route.useSearch();
  const navigate = useNavigate();
  const { isMaster, usuario, empresa } = useAuth();
  const usuarioId = usuario ? text(rowId(usuario)) : "";
  const empresaId = empresa ? text(rowId(empresa)) : "";

  const { data: atendimentos = [], isLoading } = useTableRows("atendimentos");
  const { data: pessoas = [] } = useTableRows("pessoas");
  const { data: instancias = [] } = useTableRows("empresas_instancias");
  const { data: allKanbans = [] } = useTableRows("kanban_nome");
  const { data: etapas = [] } = useTableRows("kanban_etapas");
  const { data: etiquetas = [] } = useTableRows("etiquetas");
  const { data: vincEt = [] } = useTableRows("atendimentos_etiqueta");
  const { data: participantes = [] } = useTableRows("atendimentos_participantes");
  const { data: usuarios = [] } = useTableRows("usuarios");
  const { data: notas = [] } = useTableRows("empresas_notasrapidas");
  const { data: orcamentos = [] } = useTableRows("orcamentos");
  const { data: parceiros = [] } = useTableRows("parceiros");
  const [parcFiltro, setParcFiltro] = useState("todos");

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
  const { data: ultimas = new Map<string, Row>() } = useQuery({
    queryKey: ["table", "atendimentos_mensagem", "ultimas"],
    queryFn: async () => {
      const { data } = await supabase.from("atendimentos_mensagem").select("*").eq("oculta_para_atendente", false).order("id", { ascending: false }).limit(800);
      const map = new Map<string, Row>();
      for (const m of (data ?? []) as Row[]) {
        const k = text(pick(m, M.atendimento));
        if (!map.has(k)) map.set(k, m);
      }
      return map;
    },
  });

  const acessoKb = useKanbansPermitidos();
  void meusKanbans;
  const kanbans = useMemo(() => {
    if (isMaster) return allKanbans;
    return allKanbans.filter((k) => acessoKb.pode(rowId(k)));
  }, [isMaster, allKanbans, acessoKb]);

  const instanciasAtivas = useMemo(
    () => instancias.filter((i) => i["status"] !== false && (!empresaId || !("empresa_id" in i) || text(i["empresa_id"]) === empresaId)),
    [instancias, empresaId],
  );

  const [instFiltro, setInstFiltro] = useState("todas");
  const [depFiltro, setDepFiltro] = useState("todos");
  const [rapido, setRapido] = useState<Rapido>("todos");
  const [busca, setBusca] = useState("");
  const [painel, setPainel] = useState(true);
  const [listaAberta, setLista] = useState(true);
  const [novoAberto, setNovoAberto] = useState(false);
  const { novo: novoSearch } = Route.useSearch();
  const navAt = Route.useNavigate();
  useEffect(() => {
    if (novoSearch !== "1") return;
    setNovoAberto(true);
    void navAt({ search: (s: Record<string, unknown>) => ({ ...s, novo: undefined }), replace: true } as never);
  }, [novoSearch]);

  const pessoasMap = useMemo(() => byId(pessoas), [pessoas]);
  const instMap = useMemo(() => byId(instancias), [instancias]);
  const etMap = useMemo(() => byId(etiquetas), [etiquetas]);
  const autores = useMemo(
    () => new Map(usuarios.map((u) => [text(rowId(u)), text(pick(u, ["nome", "name", "email"])).split(" ")[0] ?? ""])),
    [usuarios],
  );

  const lista = useMemo(() => {
    const permitidos = new Set(kanbans.map((k) => text(rowId(k))));
    const termo = busca.trim().toLowerCase();
    return atendimentos
      .filter((a) => isMaster || permitidos.has(text(pick(a, A.kanban))) || text(pick(a, A.responsavel)) === usuarioId)
      .filter((a) => instFiltro === "todas" || text(pick(a, A.instancia)) === instFiltro)
      .filter((a) => depFiltro === "todos" || text(pick(a, A.kanban)) === depFiltro)
      .filter((a) => parcFiltro === "todos" || text(pessoasMap.get(text(pick(a, A.pessoa)))?.["parceiro_id"]) === parcFiltro)
      .filter((a) => {
        const enc = isEncerrado(a, etapas);
        if (rapido === "encerrados") return enc;
        if (rapido !== "todos" && enc) return false;
        if (rapido === "minhas") return !!usuarioId && text(pick(a, A.responsavel)) === usuarioId;
        if (rapido === "aguardando") return !isIA(a) && !text(pick(a, A.responsavel));
        if (rapido === "ia") return isIA(a);
        return true;
      })
      .filter((a) => {
        if (!termo) return true;
        const p = pessoasMap.get(text(pick(a, A.pessoa)));
        return `${nomePessoa(p)} ${telefonePessoa(p)}`.toLowerCase().includes(termo);
      })
      .map((a) => {
        const ult = ultimas.get(text(rowId(a)));
        return { a, ult, quando: dataDe(ult, M.data) ?? dataDe(a, A.data) };
      })
      .sort((x, y) => (y.quando?.getTime() ?? 0) - (x.quando?.getTime() ?? 0));
  }, [atendimentos, etapas, kanbans, isMaster, usuarioId, instFiltro, depFiltro, parcFiltro, rapido, busca, pessoasMap, participantes, ultimas]);

  const ativo = atendimentos.find((a) => text(rowId(a)) === id);
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) setPainel(false);
  }, []);
  const abrir = (aid?: string) => navigate({ to: "/atendimentos", search: { id: aid }, replace: true });

  return (
    <div className="-m-4 flex h-[calc(100vh-4rem)] overflow-hidden border-border bg-card sm:-m-6">
      {/* Coluna 1 */}
      <aside className={cn("flex w-full flex-col border-r border-border md:w-80 lg:w-96", ativo && (listaAberta ? "hidden md:flex" : "hidden"))}>
        <div className="space-y-2 border-b border-border p-3">
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setNovoAberto(true)}>
              <Plus className="mr-1 h-4 w-4" /> Iniciar Atendimento
            </Button>
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
          {parceiros.length > 0 && (
            <Select value={parcFiltro} onValueChange={setParcFiltro}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Parceiro" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os parceiros</SelectItem>
                {parceiros.map((p) => (
                  <SelectItem key={text(rowId(p))} value={text(rowId(p))}>{text(p["razao_social"]) || text(p["nome_fantasia"]) || "—"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone" className="h-9 pl-8" />
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {RAPIDOS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRapido(r.key)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs transition-colors",
                  rapido === r.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
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
                        {interna ? "📝 Nota interna" : text(pick(ult, M.texto)) || "—"}
                      </span>
                    </p>
                    {naoLidas > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">{naoLidas}</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {inst && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{text(pick(inst, ["nome", "descricao"]))}</Badge>}
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
          kanbans={kanbans}
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
            orcamentos={orcamentos}
            onFechar={() => setPainel(false)}
          />
        </div>
      )}
    </div>
  );
}
