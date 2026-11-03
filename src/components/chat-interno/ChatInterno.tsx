import { comprimirImagem } from "@/lib/image-compress";
import { CitacaoNoBalao, FaixaResposta, lerCitacao, type Citacao } from "@/components/chat/Citacao";
import { UploadInfo } from "@/components/ui/upload-info";
import { Linkify } from "@/components/ui/linkify";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Check, CheckCheck, ArrowLeftRight, ArrowLeft, Maximize2, MessageSquare, Minimize2, Paperclip, Search, Send, Users, X, FileText, Loader2, Phone, Video, Mic, ClipboardList, Trash2, CornerUpLeft } from "lucide-react";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { ChamadaFlutuante, duracao, novaSala, type Chamada } from "@/components/atendimentos/ChamadaFlutuante";

const CONVITE = "📞CONVITE|";
const ENCERRADA = "📞 Chamada encerrada";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { tocarSom } from "@/lib/som-notificacao";
import { adicionarAviso, EVT_ABRIR_CHAT } from "@/lib/avisos";
import { TarefasChat, NovaTarefa } from "@/components/chat-interno/TarefasChat";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Canal da conversa aberta no momento (para não notificar o que já está na tela). */
let canalAberto = "";

const TABLE = "chat_interno_mensagens";
type Sel = { tipo: "direto"; outro: Row } | { tipo: "grupo"; canal: Row };

async function meusCanais(me: string) {
  const { data, error } = await supabase.from("chat_interno_participantes").select("canal_id").eq("usuario_id", me);
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => String(r["canal_id"]));
}

/** Localiza (ou cria) o canal direto entre dois usuários. */
export async function canalDireto(me: string, outroId: string, empresaId: string) {
  const mine = await meusCanais(me);
  if (mine.length) {
    const { data } = await supabase.from("chat_interno_participantes").select("canal_id").eq("usuario_id", outroId).in("canal_id", mine);
    const ids = ((data ?? []) as Row[]).map((r) => String(r["canal_id"]));
    if (ids.length) {
      const { data: c } = await supabase.from("chat_interno_canais").select("id").eq("tipo", "direto").in("id", ids).limit(1);
      if (c?.[0]) return String((c[0] as Row)["id"]);
    }
  }
  const id = crypto.randomUUID();
  const { error } = await supabase.from("chat_interno_canais").insert({ id, empresa_id: empresaId, tipo: "direto", nome: null });
  if (error) throw error;
  const p = await supabase.from("chat_interno_participantes").insert([{ canal_id: id, usuario_id: me }, { canal_id: id, usuario_id: outroId }]);
  if (p.error) throw p.error;
  return id;
}

function iniciais(nome: string) {
  return nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "U";
}

function hora(v: unknown) {
  const d = new Date(String(v ?? ""));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Chat interno da equipe: botão no menu lateral + janela flutuante. */
export function ChatInterno({ sidebarOpen, onAbrir }: { sidebarOpen: boolean; onAbrir?: (() => void) | undefined }) {
  const { usuario } = useAuth();
  const me = String(pick(usuario, ["id"]) ?? "");
  const empresaId = String(pick(usuario, ["empresa_id", "id_empresa"]) ?? "");
  const [open, setOpen] = useState(false);
  // Modo acoplado: o chat vira coluna lateral e empurra o conteúdo (só desktop).
  const [expanded, setExpanded] = useState(false);
  const [lado, setLado] = useState<"direita" | "esquerda">("direita");
  const [dockEl, setDockEl] = useState<HTMLElement | null>(null);
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const v = localStorage.getItem("chat-dock");
    if (v === "direita" || v === "esquerda") { setLado(v); setExpanded(true); }
    const mq = window.matchMedia("(min-width: 768px)");
    const f = () => setDesktop(mq.matches);
    f(); mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  useEffect(() => {
    localStorage.setItem("chat-dock", expanded ? lado : "");
    setDockEl(document.getElementById(`chat-dock-${lado}`));
  }, [expanded, lado]);
  const [modoMeet, setModoMeet] = useState<"off" | "chat" | "oculto">("off");
  const acoplado = expanded && desktop && !!dockEl && modoMeet === "off";
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Sel | null>(null);
  const [criando, setCriando] = useState(false);
  const [gNome, setGNome] = useState("");
  const [gMembros, setGMembros] = useState<Set<string>>(new Set());
  const qc = useQueryClient();
  const [online, setOnline] = useState<Set<string>>(new Set());

  // Presença em tempo real por empresa.
  useEffect(() => {
    if (!me || !empresaId) return;
    const ch = supabase.channel(`chat_interno_presence:${empresaId}`, { config: { presence: { key: me } } });
    ch.on("presence", { event: "sync" }, () => setOnline(new Set(Object.keys(ch.presenceState()))))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void ch.track({ at: Date.now() });
      });
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [me, empresaId]);

  const { data: usuarios = [] } = useQuery({
    queryKey: ["chat-interno-usuarios", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase.from("usuarios").select("*").eq("empresa_id", empresaId);
      if (error) throw error;
      return ((data ?? []) as Row[]).filter((u) => String(u["id"]) !== me && u["status"] !== false);
    },
  });

  const { data: grupos = [] } = useQuery({
    queryKey: ["chat-interno-grupos", me],
    enabled: !!me,
    queryFn: async () => {
      const ids = await meusCanais(me);
      if (!ids.length) return [] as Row[];
      const { data, error } = await supabase.from("chat_interno_canais").select("*").eq("tipo", "grupo").in("id", ids).order("nome");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const [naoLidas, setNaoLidas] = useState<Record<string, number>>({});
  const [piscar, setPiscar] = useState(false);
  const ctxRef = useRef({ open, usuarios, grupos });
  ctxRef.current = { open, usuarios, grupos };

  // Escuta global de mensagens novas da equipe.
  useEffect(() => {
    if (!me) return;
    const ch = supabase
      .channel(`chat_interno_avisos:${me}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLE }, async (payload) => {
        const m = payload.new as Row;
        const rem = String(m["remetente_id"] ?? "");
        const canal = String(m["canal_id"] ?? "");
        if (!rem || rem === me) return;
        const meus = await meusCanais(me);
        if (!meus.includes(canal)) return;
        const { open: aberto, usuarios: us, grupos: gs } = ctxRef.current;
        if (aberto && canalAberto === canal && !document.hidden) return;
        const grupo = gs.find((g) => String(g["id"]) === canal);
        const autor = us.find((u) => String(u["id"]) === rem);
        const nomeAutor = String(pick(autor ?? {}, ["nome"], "Colega"));
        const chave = grupo ? canal : rem;
        setNaoLidas((n) => ({ ...n, [chave]: (n[chave] ?? 0) + 1 }));
        setPiscar(true);
        const bruto = String(m["mensagem"] ?? "");
        const ehChamada = bruto.startsWith(CONVITE);
        const txt = ehChamada ? "📞 Está te chamando para uma chamada" : bruto.startsWith(ENCERRADA) ? "Chamada encerrada" : bruto || "Enviou um anexo";
        const abrirConversa = () => {
          setOpen(true);
          if (grupo) setSel({ tipo: "grupo", canal: grupo });
          else if (autor) setSel({ tipo: "direto", outro: autor });
        };
        tocarSom("equipe");
        if (ehChamada) {
          // Toque de chamada repetido para chamar atenção mesmo com o sistema minimizado.
          let n = 0;
          const t = setInterval(() => { tocarSom("cliente"); if (++n >= 6 || !document.hidden && canalAberto === canal) clearInterval(t); }, 1500);
        }
        const titulo = ehChamada ? `📞 Chamada de ${nomeAutor}` : grupo ? `${nomeAutor} em ${String(grupo["nome"] ?? "Grupo")}` : `Mensagem de ${nomeAutor}`;
        adicionarAviso({
          tipo: "equipe",
          titulo: ehChamada ? titulo : `Chat: ${titulo}`,
          texto: txt.length > 120 ? `${txt.slice(0, 117)}…` : txt,
          chat: grupo ? { grupo: canal } : { usuario: rem },
        });
        toast(titulo, {
          description: txt.length > 100 ? `${txt.slice(0, 97)}…` : txt,
          duration: ehChamada ? 20000 : 8000,
          action: { label: ehChamada ? "Atender" : "Abrir", onClick: abrirConversa },
        });
        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
          const notif = new Notification(titulo, {
            body: ehChamada ? "Toque para atender" : txt.slice(0, 120),
            icon: "/icon-192.png",
            tag: `interno-${canal}`,
            requireInteraction: ehChamada,
          });
          notif.onclick = () => { window.focus(); abrirConversa(); notif.close(); };
        }
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [me]);

  // Abrir conversa a partir da Central de Avisos.
  useEffect(() => {
    const fn = (e: Event) => {
      const d = (e as CustomEvent<{ grupo?: string; usuario?: string }>).detail ?? {};
      const { usuarios: us, grupos: gs } = ctxRef.current;
      setOpen(true);
      if (d.grupo) { const g = gs.find((x) => String(x["id"]) === d.grupo); if (g) setSel({ tipo: "grupo", canal: g }); }
      else if (d.usuario) { const u = us.find((x) => String(x["id"]) === d.usuario); if (u) setSel({ tipo: "direto", outro: u }); }
    };
    window.addEventListener(EVT_ABRIR_CHAT, fn);
    return () => window.removeEventListener(EVT_ABRIR_CHAT, fn);
  }, []);


  // Ao abrir uma conversa, zera as não lidas dela.
  useEffect(() => {
    if (!sel || !open) return;
    const chave = sel.tipo === "grupo" ? String(sel.canal["id"]) : String(sel.outro["id"]);
    setNaoLidas((n) => (n[chave] ? { ...n, [chave]: 0 } : n));
  }, [sel, open]);

  const totalNaoLidas = Object.values(naoLidas).reduce((a, b) => a + b, 0);
  useEffect(() => {
    if (totalNaoLidas === 0) setPiscar(false);
  }, [totalNaoLidas]);

  // O chat só fecha pelo botão de fechar (sem clique fora/ESC), para não derrubar chamadas.
  const painelRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);

  /** Envia uma mensagem automática na conversa direta (avisos de tarefas). */
  const avisar = async (outroId: string, texto: string) => {
    const canal = await canalDireto(me, outroId, empresaId);
    await supabase.from(TABLE).insert({ empresa_id: empresaId, canal_id: canal, remetente_id: me, mensagem: texto, anexos: [], lida_por: [me] });
  };

  const criarGrupo = async () => {
    if (!gNome.trim() || !gMembros.size) { toast.error("Informe o nome e ao menos um participante."); return; }
    const id = crypto.randomUUID();
    const { error } = await supabase.from("chat_interno_canais").insert({ id, empresa_id: empresaId, tipo: "grupo", nome: gNome.trim() });
    if (error) { toast.error(error.message); return; }
    const p = await supabase.from("chat_interno_participantes").insert([me, ...gMembros].map((u) => ({ canal_id: id, usuario_id: u })));
    if (p.error) { toast.error(p.error.message); return; }
    setCriando(false);
    setGNome("");
    setGMembros(new Set());
    void qc.invalidateQueries({ queryKey: ["chat-interno-grupos", me] });
    toast.success("Grupo criado.");
  };

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return usuarios
      .filter((u) => !t || String(pick(u, ["nome"], "")).toLowerCase().includes(t))
      .sort((a, b) => Number(online.has(String(b["id"]))) - Number(online.has(String(a["id"]))));
  }, [usuarios, busca, online]);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={botaoRef}
            type="button"
            onClick={() => { setOpen((o) => { if (!o) onAbrir?.(); return !o; }); setPiscar(false); }}
            aria-label="Chat da equipe"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              open && "bg-sidebar-accent",
              !sidebarOpen && "justify-center px-0",
            )}
          >
            <span className="relative">
              <MessageSquare className={cn("h-5 w-5 shrink-0", piscar && "animate-bounce text-primary")} />
              {totalNaoLidas > 0 && (
                <span className="absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center">
                  {piscar && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />}
                  <span className="relative rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">{totalNaoLidas > 9 ? "9+" : totalNaoLidas}</span>
                </span>
              )}
            </span>
            {sidebarOpen && <span className="truncate">Chat da equipe</span>}
          </button>
        </TooltipTrigger>
        {!sidebarOpen && <TooltipContent side="right">Chat da equipe</TooltipContent>}
      </Tooltip>

      {open && createPortal(
        <div
          ref={painelRef}
          className={cn(
            modoMeet === "chat"
              ? "fixed inset-y-0 right-0 z-[60] flex w-full flex-col overflow-hidden border-l border-border bg-popover text-popover-foreground shadow-2xl md:w-[380px] max-md:top-1/2"
              : modoMeet === "oculto"
                ? "hidden"
                : acoplado
              ? cn("flex h-full w-[400px] flex-col overflow-hidden bg-popover text-popover-foreground animate-in fade-in", lado === "direita" ? "border-l border-border slide-in-from-right-4" : "border-r border-border slide-in-from-left-4")
              : cn(
                  "fixed bottom-4 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-4",
                  "max-md:inset-x-2 max-md:bottom-2 max-md:top-20 max-md:h-auto max-md:w-auto max-md:max-w-none",
                  sidebarOpen ? "md:left-[15.5rem]" : "md:left-[4.5rem]",
                  "md:h-[560px] md:w-[380px] md:max-h-[calc(100vh-2rem)] md:max-w-[calc(100vw-5.5rem)]",
                ),
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Chat da equipe</p>
              <p className="flex items-center gap-1.5 text-xs text-success">
                <span className="h-2 w-2 rounded-full bg-success" /> Online
              </p>
            </div>
            <div className="flex gap-1">
              {acoplado && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLado((l) => (l === "direita" ? "esquerda" : "direita"))} aria-label="Trocar de lado" title={lado === "direita" ? "Mover para a esquerda" : "Mover para a direita"}>
                  <ArrowLeftRight className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8 max-md:hidden" onClick={() => setExpanded((e) => !e)} aria-label={expanded ? "Voltar a flutuar" : "Fixar na lateral"} title={expanded ? "Voltar a flutuar" : "Fixar na lateral"}>
                {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Fechar">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {sel ? (
            <div className="flex min-h-0 flex-1">
              <ScrollArea className="w-14 shrink-0 border-r border-border max-sm:hidden">
                <div className="flex flex-col items-center gap-1 py-2">
                  {lista.map((u) => {
                    const id = String(u["id"]);
                    const nomeU = String(pick(u, ["nome"], "Usuário"));
                    const ativo = sel.tipo === "direto" && String(sel.outro["id"]) === id;
                    const n = naoLidas[id] ?? 0;
                    return (
                      <Tooltip key={id}>
                        <TooltipTrigger asChild>
                          <button type="button" onClick={() => { setSel({ tipo: "direto", outro: u }); setNaoLidas((x) => ({ ...x, [id]: 0 })); }} aria-label={nomeU} className={cn("relative rounded-full p-0.5 transition", ativo ? "ring-2 ring-primary" : "hover:ring-2 hover:ring-accent")}>
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={String(pick(u, ["foto"], ""))} alt={nomeU} />
                              <AvatarFallback className="text-xs">{iniciais(nomeU)}</AvatarFallback>
                            </Avatar>
                            <span className={cn("absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-popover", online.has(id) ? "bg-success" : "bg-muted-foreground")} />
                            {n > 0 && <span className="absolute -top-1 -right-1 rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">{n}</span>}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right">{nomeU}</TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </ScrollArea>
              <Conversa
                key={sel.tipo === "direto" ? `d${sel.outro["id"]}` : `g${sel.canal["id"]}`}
                me={me}
                empresaId={empresaId}
                sel={sel}
                usuarios={usuarios}
                isOnline={sel.tipo === "direto" && online.has(String(sel.outro["id"]))}
                onBack={() => setSel(null)}
                onModoMeet={setModoMeet}
              />
            </div>
          ) : (
            <Tabs defaultValue="atendentes" className="flex min-h-0 flex-1 flex-col animate-in fade-in">
              <TabsList className="mx-4 mt-3 grid grid-cols-3">
                <TabsTrigger value="atendentes" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Atendentes</TabsTrigger>
                <TabsTrigger value="grupos" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Grupos</TabsTrigger>
                <TabsTrigger value="tarefas" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Tarefas</TabsTrigger>
              </TabsList>
              <TabsContent value="atendentes" className="flex min-h-0 flex-1 flex-col">
                <div className="relative mx-4 my-3">
                  <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquise entre os atendentes..." className="pl-9" />
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-0.5 px-2 pb-3">
                    {lista.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum atendente encontrado.</p>}
                    {lista.map((u) => {
                      const nome = String(pick(u, ["nome"], "Usuário"));
                      const on = online.has(String(u["id"]));
                      return (
                        <button key={String(u["id"])} type="button" onClick={() => setSel({ tipo: "direto", outro: u })} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent">
                          <div className="relative">
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={String(pick(u, ["foto"], ""))} alt={nome} />
                              <AvatarFallback>{iniciais(nome)}</AvatarFallback>
                            </Avatar>
                            <span className={cn("absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-popover", on ? "bg-success" : "bg-muted-foreground")} />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{nome}</p>
                            <p className={cn("text-xs", on ? "text-success" : "text-muted-foreground")}>{on ? "Online" : "Offline"}</p>
                          </div>
                          {(naoLidas[String(u["id"])] ?? 0) > 0 && <span className="ml-auto rounded-full bg-destructive px-1.5 text-xs font-bold text-destructive-foreground">{naoLidas[String(u["id"])]}</span>}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="grupos" className="flex min-h-0 flex-1 flex-col">
                {criando ? (
                  <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
                    <Input value={gNome} onChange={(e) => setGNome(e.target.value)} placeholder="Nome do grupo" />
                    <p className="text-xs text-muted-foreground">Participantes</p>
                    <ScrollArea className="min-h-0 flex-1 rounded-md border border-border">
                      <div className="p-1">
                        {usuarios.map((u) => {
                          const id = String(u["id"]);
                          const on = gMembros.has(id);
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setGMembros((s) => { const n = new Set(s); if (on) n.delete(id); else n.add(id); return n; })}
                              className={cn("flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-accent", on && "bg-accent")}
                            >
                              {String(pick(u, ["nome"], "Usuário"))}
                              {on && <Check className="h-4 w-4 text-primary" />}
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setCriando(false)}>Cancelar</Button>
                      <Button size="sm" onClick={() => void criarGrupo()}>Salvar</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="px-4 py-3">
                      <Button size="sm" variant="outline" className="w-full" onClick={() => setCriando(true)}>
                        <Plus className="mr-1 h-4 w-4" /> Novo grupo
                      </Button>
                    </div>
                    <ScrollArea className="min-h-0 flex-1">
                      <div className="space-y-0.5 px-2 pb-3">
                        {grupos.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhum grupo criado ainda.</p>}
                        {grupos.map((g) => (
                          <button key={String(g["id"])} type="button" onClick={() => setSel({ tipo: "grupo", canal: g })} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent">
                            <Avatar className="h-10 w-10"><AvatarFallback><Users className="h-4 w-4" /></AvatarFallback></Avatar>
                            <p className="truncate text-sm font-medium">{String(g["nome"] ?? "Grupo")}</p>
                            {(naoLidas[String(g["id"])] ?? 0) > 0 && <span className="ml-auto rounded-full bg-destructive px-1.5 text-xs font-bold text-destructive-foreground">{naoLidas[String(g["id"])]}</span>}
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </>
                )}
              </TabsContent>
              <TabsContent value="tarefas" className="flex min-h-0 flex-1 flex-col">
                <TarefasChat me={me} empresaId={empresaId} usuarios={usuarios} onAvisar={avisar} />
              </TabsContent>
            </Tabs>
          )}
        </div>,
        acoplado && dockEl ? dockEl : document.body,
      )}
    </>
  );
}

type Anexo = { url: string; nome: string; tipo: string };

function Conversa({ me, empresaId, sel, usuarios, isOnline, onBack, onModoMeet }: { me: string; empresaId: string; sel: Sel; usuarios: Row[]; isOnline: boolean; onBack: () => void; onModoMeet?: (modo: "off" | "chat" | "oculto") => void }) {
  const qc = useQueryClient();
  const nome = sel.tipo === "direto" ? String(pick(sel.outro, ["nome"], "Usuário")) : String(sel.canal["nome"] ?? "Grupo");
  const [canalId, setCanalId] = useState<string>(sel.tipo === "grupo" ? String(sel.canal["id"]) : "");
  const [texto, setTexto] = useState("");
  const [respondendo, setRespondendo] = useState<Citacao | null>(null);
  const [enviando, setEnviando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { usuario } = useAuth();
  const meuNome = String(pick(usuario, ["nome"], "Colaborador"));
  const [chamada, setChamada] = useState<Chamada | null>(null);
  const [chamadaMin, setChamadaMin] = useState(false);
  const [chatNaChamada, setChatNaChamada] = useState(true);
  // Informa o painel do chat para acoplar à direita da chamada (estilo Google Meet).
  useEffect(() => {
    onModoMeet?.(!chamada || chamadaMin ? "off" : chatNaChamada ? "chat" : "oculto");
  }, [chamada, chamadaMin, chatNaChamada, onModoMeet]);
  useEffect(() => () => onModoMeet?.("off"), [onModoMeet]);
  const endRef = useRef<HTMLDivElement>(null);
  const key = ["chat-interno", canalId];
  const nomes = useMemo(() => new Map(usuarios.map((u) => [String(u["id"]), String(pick(u, ["nome"], "Usuário"))])), [usuarios]);

  useEffect(() => {
    if (sel.tipo !== "direto") return;
    canalDireto(me, String(sel.outro["id"]), empresaId).then(setCanalId).catch((e: Error) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: msgs = [] } = useQuery({
    queryKey: key,
    enabled: !!canalId,
    queryFn: async () => {
      const { data, error } = await supabase.from(TABLE).select("*").eq("canal_id", canalId).order("criado_em", { ascending: true }).limit(300);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  useEffect(() => {
    canalAberto = canalId;
    return () => {
      if (canalAberto === canalId) canalAberto = "";
    };
  }, [canalId]);

  useEffect(() => {
    if (!canalId) return;
    const ch = supabase
      .channel(`chat_interno:${canalId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter: `canal_id=eq.${canalId}` }, () => {
        void qc.invalidateQueries({ queryKey: key });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canalId]);

  // Marca como lidas as mensagens recebidas.
  useEffect(() => {
    msgs
      .filter((m) => String(m["remetente_id"]) !== me && !((m["lida_por"] as string[] | null) ?? []).includes(me))
      .forEach((m) => {
        void supabase.from(TABLE).update({ lida_por: [...((m["lida_por"] as string[] | null) ?? []), me] }).eq("id", String(m["id"]));
      });
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, me]);

  const enviar = async (anexo?: Anexo) => {
    const msg = texto.trim();
    if ((!msg && !anexo) || !canalId) return;
    setEnviando(true);
    const linha: Record<string, unknown> = {
      empresa_id: empresaId,
      canal_id: canalId,
      remetente_id: me,
      mensagem: msg || anexo?.nome || "",
      anexos: anexo ? [anexo] : [],
      lida_por: [me],
    };
    if (respondendo) linha["citacao"] = respondendo;
    let { error } = await supabase.from(TABLE).insert(linha as never);
    // Banco ainda sem a coluna "citacao": envia sem a citação.
    if (error && respondendo && /citacao/i.test(error.message)) {
      delete linha["citacao"];
      ({ error } = await supabase.from(TABLE).insert(linha as never));
    }
    setEnviando(false);
    if (error) { toast.error(error.message); return; }
    setTexto("");
    setRespondendo(null);
    void qc.invalidateQueries({ queryKey: key });
  };

  const anexar = async (original: File) => {
    const file = original.type.startsWith("image/") ? await comprimirImagem(original, "chat") : original;
    setEnviando(true);
    const path = `interno/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("chat_media").upload(path, file, file.type ? { contentType: file.type } : undefined);
    setEnviando(false);
    if (up.error) { toast.error(up.error.message); return; }
    const url = supabase.storage.from("chat_media").getPublicUrl(path).data.publicUrl;
    const t = file.type;
    await enviar({ url, nome: file.name, tipo: t.startsWith("image/") ? "imagem" : t.startsWith("audio/") ? "audio" : t.startsWith("video/") ? "video" : "documento" });
    if (fileRef.current) fileRef.current.value = "";
  };

  const colar = (e: import("react").ClipboardEvent<HTMLTextAreaElement>) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    const f = item?.getAsFile();
    if (!f) return;
    e.preventDefault();
    const ext = f.type.split("/")[1] || "png";
    void anexar(new File([f], `print-${Date.now()}.${ext}`, { type: f.type }));
  };

  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [gravando]);

  const gravar = async () => {
    if (gravando) { recRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const partes: Blob[] = [];
      rec.ondataavailable = (ev) => ev.data.size && partes.push(ev.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setGravando(false);
        const tipo = rec.mimeType || "audio/webm";
        const blob = new Blob(partes, { type: tipo });
        if (blob.size > 0 && !(rec as MediaRecorder & { cancelado?: boolean }).cancelado) {
          void anexar(new File([blob], `audio-${Date.now()}.${tipo.includes("ogg") ? "ogg" : tipo.includes("mp4") ? "m4a" : "webm"}`, { type: tipo }));
        }
      };
      recRef.current = rec;
      setSegundos(0);
      setGravando(true);
      rec.start();
    } catch {
      toast.error("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
    }
  };
  const cancelarGravacao = () => {
    const r = recRef.current as (MediaRecorder & { cancelado?: boolean }) | null;
    if (r) { r.cancelado = true; r.stop(); }
  };

  const apagar = async (m: Row, anexos: Anexo[]) => {
    const ok = await confirmar({ title: "Apagar mensagem?", description: anexos.length ? "A mensagem e o arquivo serão apagados para todos na conversa." : "A mensagem será apagada para todos na conversa.", destructive: true });
    if (!ok) return;
    const { data, error } = await supabase.from(TABLE).delete().eq("id", String(m["id"])).eq("remetente_id", me).select("id");
    if (error || !data?.length) { toast.error(error?.message ?? "Não foi possível apagar. Rode o script atendeai-chat-apagar-mensagens.sql no banco."); return; }
    const marca = "/object/public/chat_media/";
    const caminhos = anexos.map((a) => { const i = a.url.indexOf(marca); return i >= 0 ? decodeURIComponent(a.url.slice(i + marca.length).split("?")[0]!) : ""; }).filter(Boolean);
    if (caminhos.length) await supabase.storage.from("chat_media").remove(caminhos);
    toast.success("Mensagem apagada.");
    void qc.invalidateQueries({ queryKey: key });
  };

  const [novaTarefa, setNovaTarefa] = useState(false);

  const iniciarChamada = async (video: boolean) => {
    if (!canalId || chamada) return;
    const sala = novaSala();
    setChamada({ sala, video, inicio: Date.now(), iniciador: meuNome });
    await supabase.from(TABLE).insert({
      empresa_id: empresaId, canal_id: canalId, remetente_id: me,
      mensagem: `${CONVITE}${sala}|${video ? 1 : 0}`, anexos: [], lida_por: [me],
    });
    void qc.invalidateQueries({ queryKey: key });
  };

  const entrar = (sala: string, video: boolean) => {
    if (chamada) return;
    setChamada({ sala, video, inicio: Date.now() });
  };

  const encerrar = async () => {
    const c = chamada;
    setChamada(null);
    if (!c || !canalId) return;
    const fim = Date.now();
    const h = (t: number) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    await supabase.from(TABLE).insert({
      empresa_id: empresaId, canal_id: canalId, remetente_id: me,
      mensagem: `${ENCERRADA}\nInício: ${h(c.inicio)} · Término: ${h(fim)} · Duração: ${duracao(fim - c.inicio)}`,
      anexos: [], lida_por: [me],
    });
    void qc.invalidateQueries({ queryKey: key });
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden animate-in fade-in slide-in-from-right-4">
      <div className="flex items-center gap-2 border-b border-border px-2 py-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack} aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-8 w-8">
          {sel.tipo === "direto" && <AvatarImage src={String(pick(sel.outro, ["foto"], ""))} alt={nome} />}
          <AvatarFallback>{sel.tipo === "grupo" ? <Users className="h-4 w-4" /> : iniciais(nome)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{nome}</p>
          {sel.tipo === "direto" ? (
            <p className={cn("text-xs", isOnline ? "text-success" : "text-muted-foreground")}>{isOnline ? "Online" : "Offline"}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Grupo</p>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setNovaTarefa(true)} aria-label="Nova tarefa" title={sel.tipo === "direto" ? `Nova tarefa para ${nome}` : "Nova tarefa"}>
          <ClipboardList className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canalId || !!chamada} onClick={() => void iniciarChamada(false)} aria-label="Chamada de áudio">
          <Phone className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canalId || !!chamada} onClick={() => void iniciarChamada(true)} aria-label="Chamada de vídeo">
          <Video className="h-4 w-4" />
        </Button>
      </div>
      <Dialog open={novaTarefa} onOpenChange={setNovaTarefa}>
        <DialogContent className="flex max-h-[90vh] flex-col p-0">
          <DialogHeader className="px-4 pt-4"><DialogTitle>{sel.tipo === "direto" ? `Nova tarefa para ${nome}` : "Nova tarefa"}</DialogTitle></DialogHeader>
          {novaTarefa && (
            <NovaTarefa me={me} empresaId={empresaId} usuarios={usuarios} responsavelInicial={sel.tipo === "direto" ? String(sel.outro["id"]) : me}
              onCancel={() => setNovaTarefa(false)}
              onSaved={async (resp, titulo) => {
                setNovaTarefa(false);
                void qc.invalidateQueries({ queryKey: ["tarefas-usuarios", me] });
                if (resp !== me && canalId && sel.tipo === "direto" && resp === String(sel.outro["id"])) {
                  await supabase.from(TABLE).insert({ empresa_id: empresaId, canal_id: canalId, remetente_id: me, mensagem: `📋 Nova tarefa para você: "${titulo}". Abra a aba Tarefas para aceitar ou recusar.`, anexos: [], lida_por: [me] });
                  void qc.invalidateQueries({ queryKey: key });
                }
              }} />
          )}
        </DialogContent>
      </Dialog>
      {chamada && createPortal(<ChamadaFlutuante chamada={chamada} nome={meuNome} titulo={`Chamada · ${nome}`} onEncerrar={() => void encerrar()}
        meet min={chamadaMin} onMin={setChamadaMin} chatAberto={chatNaChamada} onChat={() => setChatNaChamada((v) => !v)} />, document.body)}

      <ScrollArea className="min-h-0 min-w-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block [&_[data-radix-scroll-area-viewport]>div]:!min-w-0">
        <div className="min-w-0 space-y-2 p-3">
          {!canalId && <Loader2 className="mx-auto my-8 h-5 w-5 animate-spin text-muted-foreground" />}
          {canalId && msgs.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Envie a primeira mensagem para {nome}.</p>}
          {msgs.map((m) => {
            const mine = String(m["remetente_id"]) === me;
            const txt = String(m["mensagem"] ?? "");
            const autor = mine ? "Você" : (nomes.get(String(m["remetente_id"])) ?? "Usuário");
            if (txt.startsWith(CONVITE) || txt.startsWith(ENCERRADA)) {
              const convite = txt.startsWith(CONVITE);
              const [, sala = "", v = "1"] = txt.split("|");
              const video = v === "1";
              return (
                <div key={String(m["id"])} className="flex justify-center">
                  <div className="w-full max-w-[85%] rounded-xl border border-border bg-card p-3 text-sm">
                    <div className="flex items-center gap-2 font-medium">
                      {convite && video ? <Video className="h-4 w-4 text-primary" /> : <Phone className="h-4 w-4 text-primary" />}
                      {convite ? `${autor} iniciou uma chamada de ${video ? "vídeo" : "áudio"}` : ENCERRADA.replace("📞 ", "")}
                      <span className="ml-auto text-[10px] text-muted-foreground">{hora(m["criado_em"])}</span>
                    </div>
                    {!convite && <p className="mt-1 text-xs text-muted-foreground">{txt.split("\n").slice(1).join(" ")}</p>}
                    {convite && !mine && (
                      <Button size="sm" className="mt-2 w-full" disabled={!!chamada} onClick={() => entrar(sala, video)}>
                        Entrar na chamada
                      </Button>
                    )}
                  </div>
                </div>
              );
            }
            const anexos = (Array.isArray(m["anexos"]) ? m["anexos"] : []) as Anexo[];
            return (
              <div key={String(m["id"])} id={`msg-${String(m["id"])}`} className={cn("group flex min-w-0 items-center gap-1 transition", mine ? "flex-row-reverse" : "flex-row")}>
                <div className={cn("min-w-0 max-w-[80%] overflow-hidden rounded-2xl px-3 py-2 text-sm [overflow-wrap:anywhere]", mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted")}>
                  {!mine && sel.tipo === "grupo" && <p className="mb-0.5 text-xs font-semibold text-primary">{nomes.get(String(m["remetente_id"])) ?? "Usuário"}</p>}
                  {(() => { const c = lerCitacao(m["citacao"]); return c ? <CitacaoNoBalao citacao={c} claro={mine} /> : null; })()}
                  {anexos.map((a, i) =>
                    a.tipo === "imagem" ? (
                      <a key={i} href={a.url} target="_blank" rel="noreferrer">
                        <img src={a.url} alt={a.nome || "Imagem"} className="mb-1 max-h-48 rounded-lg" />
                      </a>
                    ) : a.tipo === "audio" ? (
                      <audio key={i} src={a.url} controls preload="metadata" className="mb-1 h-10 w-56 max-w-full" />
                    ) : a.tipo === "video" ? (
                      <video key={i} src={a.url} controls preload="metadata" className="mb-1 max-h-60 max-w-full rounded-lg" />
                    ) : (
                      <a key={i} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline">
                        <FileText className="h-4 w-4" /> {a.nome || "Arquivo"}
                      </a>
                    ),
                  )}
                  {anexos.length === 0 && <p className="break-words whitespace-pre-wrap"><Linkify text={String(m["mensagem"] ?? "")} /></p>}
                  {(() => {
                    const leitores = ((m["lida_por"] as string[] | null) ?? []).filter((u) => u !== me);
                    const vista = leitores.length > 0;
                    const quem = leitores.map((u) => nomes.get(u) ?? "Usuário").join(", ");
                    return (
                      <p className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {hora(m["criado_em"])}
                        {mine && (
                          <span title={vista ? `Visualizada${sel.tipo === "grupo" ? ` por ${quem}` : ""}` : "Enviada, ainda não visualizada"} aria-label={vista ? "Visualizada" : "Enviada"} className={cn("inline-flex", vista && "text-primary-foreground")}>
                            {vista ? <CheckCheck className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                          </span>
                        )}
                      </p>
                    );
                  })()}
                </div>
                <Button
                  type="button" variant="ghost" size="icon" tooltip="Responder" aria-label="Responder"
                  className="h-7 w-7 shrink-0 opacity-60 transition sm:opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  onClick={() => setRespondendo({ id: String(m["id"]), autor, texto: txt || anexos[0]?.nome || "Anexo" })}
                >
                  <CornerUpLeft className="h-3.5 w-3.5" />
                </Button>
                {mine && (
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive opacity-0 transition group-hover:opacity-100 focus:opacity-100" title="Apagar mensagem" aria-label="Apagar mensagem" onClick={() => void apagar(m, anexos)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      {respondendo && <div className="min-w-0 border-t border-border px-2 pt-2"><FaixaResposta citacao={respondendo} onCancelar={() => setRespondendo(null)} /></div>}
      <form
        className={cn("flex min-w-0 items-end gap-1 p-2", respondendo ? "pt-0" : "border-t border-border")}
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <input ref={fileRef} type="file" accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip" hidden onChange={(e) => e.target.files?.[0] && void anexar(e.target.files[0])} />
        {gravando ? (
          <>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={cancelarGravacao} aria-label="Cancelar gravação">
              <X className="h-4 w-4" />
            </Button>
            <div className="flex flex-1 items-center gap-2 px-2 text-sm text-destructive">
              <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" /> Gravando {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, "0")}
            </div>
            <Button type="button" size="icon" className="h-9 w-9 shrink-0" onClick={() => void gravar()} aria-label="Enviar áudio">
              <Send className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => fileRef.current?.click()} aria-label="Anexar arquivo, imagem ou vídeo" title="Anexar arquivo, imagem ou vídeo" disabled={enviando || !canalId}>
              <Paperclip className="h-4 w-4" />
            </Button>
            <UploadInfo perfil="chat" arquivos />
            <textarea
              ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; } }}
              rows={1}
              value={texto}
              onChange={(e) => { setTexto(e.target.value); const el = e.currentTarget; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void enviar(); } }}
              onPaste={colar}
              placeholder="Mensagem (Shift+Enter pula linha)..."
              title="Enter envia · Shift+Enter pula linha"
              className="max-h-40 min-h-9 min-w-0 flex-1 resize-none overflow-y-auto rounded-md border border-input bg-background px-3 py-2 text-sm leading-5 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {texto.trim() ? (
              <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={enviando || !canalId} aria-label="Enviar">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            ) : (
              <Button type="button" size="icon" className="h-9 w-9 shrink-0" disabled={enviando || !canalId} onClick={() => void gravar()} aria-label="Gravar áudio" title="Gravar áudio">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              </Button>
            )}
          </>
        )}
      </form>
    </div>
  );
}
