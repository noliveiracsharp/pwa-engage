import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Check, ArrowLeft, Maximize2, MessageSquare, Minimize2, Paperclip, Search, Send, Users, X, FileText, Loader2 } from "lucide-react";
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
export function ChatInterno({ sidebarOpen }: { sidebarOpen: boolean }) {
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

  const criarGrupo = async () => {
    if (!gNome.trim() || !gMembros.size) return toast.error("Informe o nome e ao menos um participante.");
    const id = crypto.randomUUID();
    const { error } = await supabase.from("chat_interno_canais").insert({ id, empresa_id: empresaId, tipo: "grupo", nome: gNome.trim() });
    if (error) return toast.error(error.message);
    const p = await supabase.from("chat_interno_participantes").insert([me, ...gMembros].map((u) => ({ canal_id: id, usuario_id: u })));
    if (p.error) return toast.error(p.error.message);
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
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label="Chat da equipe"
            className={cn(
              "mt-auto flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              open && "bg-sidebar-accent",
              !sidebarOpen && "justify-center px-0",
            )}
          >
            <MessageSquare className="h-5 w-5 shrink-0" />
            {sidebarOpen && <span className="truncate">Chat da equipe</span>}
          </button>
        </TooltipTrigger>
        {!sidebarOpen && <TooltipContent side="right">Chat da equipe</TooltipContent>}
      </Tooltip>

      {open && (
        <div
          className={cn(
            "fixed bottom-4 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-4",
            sidebarOpen ? "left-[15.5rem]" : "left-[4.5rem]",
            expanded ? "h-[85vh] w-[640px]" : "h-[560px] w-[380px]",
            "max-h-[calc(100vh-2rem)] max-w-[calc(100vw-5.5rem)]",
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
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      )}
    </>
  );
}

