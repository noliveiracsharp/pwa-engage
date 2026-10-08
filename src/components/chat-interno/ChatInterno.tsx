import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Check, ArrowLeft, Maximize2, MessageSquare, Minimize2, Paperclip, Search, Send, Users, X, FileText, Loader2, Phone, Video } from "lucide-react";
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
async function canalDireto(me: string, outroId: string, empresaId: string) {
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
  const [expanded, setExpanded] = useState(false);
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
        tocarSom("equipe");
        const txt = String(m["mensagem"] ?? "") || "Enviou um anexo";
        toast(grupo ? `${nomeAutor} em ${String(grupo["nome"] ?? "Grupo")}` : `Mensagem de ${nomeAutor}`, {
          description: txt.length > 100 ? `${txt.slice(0, 97)}…` : txt,
          duration: 8000,
          action: {
            label: "Abrir",
            onClick: () => {
              setOpen(true);
              if (grupo) setSel({ tipo: "grupo", canal: grupo });
              else if (autor) setSel({ tipo: "direto", outro: autor });
            },
          },
        });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [me]);

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

  // Fecha com ESC ou clique fora da janela.
  const painelRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t) return;
      if (painelRef.current?.contains(t) || botaoRef.current?.contains(t)) return;
      if (t.closest("[data-radix-popper-content-wrapper],[role='dialog'],[data-sonner-toaster]")) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

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
            "fixed bottom-4 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-4",
            "max-md:inset-x-2 max-md:bottom-2 max-md:top-20 max-md:h-auto max-md:w-auto max-md:max-w-none",
            sidebarOpen ? "md:left-[15.5rem]" : "md:left-[4.5rem]",
            expanded ? "md:h-[85vh] md:w-[640px]" : "md:h-[560px] md:w-[380px]",
            "md:max-h-[calc(100vh-2rem)] md:max-w-[calc(100vw-5.5rem)]",
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
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpanded((e) => !e)} aria-label={expanded ? "Minimizar" : "Expandir"}>
                {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Fechar">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {sel ? (
            <Conversa
              key={sel.tipo === "direto" ? `d${sel.outro["id"]}` : `g${sel.canal["id"]}`}
              me={me}
              empresaId={empresaId}
              sel={sel}
              usuarios={usuarios}
              isOnline={sel.tipo === "direto" && online.has(String(sel.outro["id"]))}
              onBack={() => setSel(null)}
            />
          ) : (
            <Tabs defaultValue="atendentes" className="flex min-h-0 flex-1 flex-col animate-in fade-in">
              <TabsList className="mx-4 mt-3 grid grid-cols-2">
                <TabsTrigger value="atendentes" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Atendentes</TabsTrigger>
                <TabsTrigger value="grupos" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Grupos</TabsTrigger>
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
            </Tabs>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

type Anexo = { url: string; nome: string; tipo: string };

function Conversa({ me, empresaId, sel, usuarios, isOnline, onBack }: { me: string; empresaId: string; sel: Sel; usuarios: Row[]; isOnline: boolean; onBack: () => void }) {
  const qc = useQueryClient();
  const nome = sel.tipo === "direto" ? String(pick(sel.outro, ["nome"], "Usuário")) : String(sel.canal["nome"] ?? "Grupo");
  const [canalId, setCanalId] = useState<string>(sel.tipo === "grupo" ? String(sel.canal["id"]) : "");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { usuario } = useAuth();
  const meuNome = String(pick(usuario, ["nome"], "Colaborador"));
  const [chamada, setChamada] = useState<Chamada | null>(null);
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLE, filter: `canal_id=eq.${canalId}` }, () => {
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
    const { error } = await supabase.from(TABLE).insert({
      empresa_id: empresaId,
      canal_id: canalId,
      remetente_id: me,
      mensagem: msg || anexo?.nome || "",
      anexos: anexo ? [anexo] : [],
      lida_por: [me],
    });
    setEnviando(false);
    if (error) { toast.error(error.message); return; }
    setTexto("");
    void qc.invalidateQueries({ queryKey: key });
  };

  const anexar = async (file: File) => {
    setEnviando(true);
    const path = `interno/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("chat_media").upload(path, file, file.type ? { contentType: file.type } : undefined);
    setEnviando(false);
    if (up.error) { toast.error(up.error.message); return; }
    const url = supabase.storage.from("chat_media").getPublicUrl(path).data.publicUrl;
    await enviar({ url, nome: file.name, tipo: file.type.startsWith("image/") ? "imagem" : "documento" });
    if (fileRef.current) fileRef.current.value = "";
  };

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
    <div className="flex min-h-0 flex-1 flex-col animate-in fade-in slide-in-from-right-4">
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
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canalId || !!chamada} onClick={() => void iniciarChamada(false)} aria-label="Chamada de áudio">
          <Phone className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={!canalId || !!chamada} onClick={() => void iniciarChamada(true)} aria-label="Chamada de vídeo">
          <Video className="h-4 w-4" />
        </Button>
      </div>
      {chamada && createPortal(<ChamadaFlutuante chamada={chamada} nome={meuNome} titulo={`Chamada · ${nome}`} onEncerrar={() => void encerrar()} />, document.body)}

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-3">
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
              <div key={String(m["id"])} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm", mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted")}>
                  {!mine && sel.tipo === "grupo" && <p className="mb-0.5 text-xs font-semibold text-primary">{nomes.get(String(m["remetente_id"])) ?? "Usuário"}</p>}
                  {anexos.map((a, i) =>
                    a.tipo === "imagem" ? (
                      <a key={i} href={a.url} target="_blank" rel="noreferrer">
                        <img src={a.url} alt={a.nome || "Imagem"} className="mb-1 max-h-48 rounded-lg" />
                      </a>
                    ) : (
                      <a key={i} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline">
                        <FileText className="h-4 w-4" /> {a.nome || "Arquivo"}
                      </a>
                    ),
                  )}
                  {anexos.length === 0 && <p className="break-words whitespace-pre-wrap">{String(m["mensagem"] ?? "")}</p>}
                  <p className={cn("mt-0.5 text-right text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>{hora(m["criado_em"])}</p>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <form
        className="flex items-center gap-1 border-t border-border p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        <input ref={fileRef} type="file" hidden onChange={(e) => e.target.files?.[0] && void anexar(e.target.files[0])} />
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => fileRef.current?.click()} aria-label="Anexar arquivo" disabled={enviando || !canalId}>
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Digite uma mensagem..." className="flex-1" />
        <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={enviando || !texto.trim() || !canalId} aria-label="Enviar">
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
