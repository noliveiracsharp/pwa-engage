import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Maximize2, MessageSquare, Minimize2, Paperclip, Search, Send, Users, X, FileText, Loader2 } from "lucide-react";
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
  const [sel, setSel] = useState<Row | null>(null);
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
            <Conversa key={String(sel["id"])} me={me} empresaId={empresaId} outro={sel} isOnline={online.has(String(sel["id"]))} onBack={() => setSel(null)} />
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
                        <button key={String(u["id"])} type="button" onClick={() => setSel(u)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent">
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
              <TabsContent value="grupos" className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                <Users className="h-8 w-8" />
                Nenhum grupo criado ainda.
              </TabsContent>
            </Tabs>
          )}
        </div>
      )}
    </>
  );
}

function Conversa({ me, empresaId, outro, isOnline, onBack }: { me: string; empresaId: string; outro: Row; isOnline: boolean; onBack: () => void }) {
  const qc = useQueryClient();
  const outroId = String(outro["id"]);
  const nome = String(pick(outro, ["nome"], "Usuário"));
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const key = ["chat-interno", me, outroId];

  const { data: msgs = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .or(`and(remetente_id.eq.${me},destinatario_id.eq.${outroId}),and(remetente_id.eq.${outroId},destinatario_id.eq.${me})`)
        .order("created_at", { ascending: true })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`chat_interno:${me}:${outroId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLE }, (p) => {
        const m = p.new as Row;
        const ids = [String(m["remetente_id"]), String(m["destinatario_id"])];
        if (ids.includes(me) && ids.includes(outroId)) void qc.invalidateQueries({ queryKey: key });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, outroId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  const enviar = async (extra?: Row) => {
    const msg = texto.trim();
    if (!msg && !extra) return;
    setEnviando(true);
    const { error } = await supabase.from(TABLE).insert({
      empresa_id: empresaId || null,
      remetente_id: me,
      destinatario_id: outroId,
      mensagem: msg || String(extra?.["nome_arquivo"] ?? ""),
      ...extra,
    });
    setEnviando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTexto("");
    void qc.invalidateQueries({ queryKey: key });
  };

  const anexar = async (file: File) => {
    setEnviando(true);
    const path = `interno/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("chat_media").upload(path, file, file.type ? { contentType: file.type } : undefined);
    setEnviando(false);
    if (up.error) {
      toast.error(up.error.message);
      return;
    }
    const url = supabase.storage.from("chat_media").getPublicUrl(path).data.publicUrl;
    await enviar({ url_midia: url, nome_arquivo: file.name, tipo_midia: file.type.startsWith("image/") ? "imagem" : "documento" });
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col animate-in fade-in slide-in-from-right-4">
      <div className="flex items-center gap-2 border-b border-border px-2 py-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack} aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-8 w-8">
          <AvatarImage src={String(pick(outro, ["foto"], ""))} alt={nome} />
          <AvatarFallback>{iniciais(nome)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{nome}</p>
          <p className={cn("text-xs", isOnline ? "text-success" : "text-muted-foreground")}>{isOnline ? "Online" : "Offline"}</p>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-3">
          {msgs.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Envie a primeira mensagem para {nome}.</p>}
          {msgs.map((m) => {
            const mine = String(m["remetente_id"]) === me;
            const url = String(m["url_midia"] ?? "");
            return (
              <div key={String(m["id"])} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm", mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted")}>
                  {url && m["tipo_midia"] === "imagem" && (
                    <a href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt={String(m["nome_arquivo"] ?? "Imagem")} className="mb-1 max-h-48 rounded-lg" />
                    </a>
                  )}
                  {url && m["tipo_midia"] !== "imagem" ? (
                    <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline">
                      <FileText className="h-4 w-4" /> {String(m["nome_arquivo"] ?? "Arquivo")}
                    </a>
                  ) : (
                    !url && <p className="break-words whitespace-pre-wrap">{String(m["mensagem"] ?? "")}</p>
                  )}
                  <p className={cn("mt-0.5 text-right text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>{hora(m["created_at"])}</p>
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
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => fileRef.current?.click()} aria-label="Anexar arquivo" disabled={enviando}>
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Digite uma mensagem..." className="flex-1" />
        <Button type="submit" size="icon" className="h-9 w-9 shrink-0" disabled={enviando || !texto.trim()} aria-label="Enviar">
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
