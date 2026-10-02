import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Bot, FileText, Hand, Lock, MoveRight, Paperclip, PanelRightClose, PanelRightOpen, Send, Smile, CheckCircle2, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { rowId, text, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { filterPayload, useCols } from "@/lib/projetos";
import { useAudit } from "@/lib/audit";
import {
  A, M, STATUS_LABEL, dataDe, fotoPessoa, iniciais, isCliente, isIA, nomePessoa, statusDe, tipoMidia,
  telefonePessoa,
} from "@/lib/atendimentos";
import { dispararMensagem, marcarEnvio } from "@/lib/atendimentos-envio";
import { etapaHumano, etapaPayload } from "@/lib/atendimentos";
import { GravadorAudio } from "./GravadorAudio";

const EMOJIS = "😀 😃 😄 😁 😅 😂 🙂 😉 😊 😍 😘 🤔 😐 😴 😢 😭 😡 👍 👎 👏 🙏 💪 👋 🤝 ✅ ❌ ⚠️ ❤️ 🔥 🎉 ⭐ 📦 📄 📞 💰 🕐 🚀 💬 📍 🙌".split(" ");

type Props = {
  atendimento: Row;
  pessoa: Row | undefined;
  instancia: Row | undefined;
  kanbans: Row[];
  etapas: Row[];
  notas: Row[];
  painelAberto: boolean;
  onTogglePainel: () => void;
  onVoltar: () => void;
};

export function ChatPainel({ atendimento, pessoa, instancia, kanbans, etapas, notas, painelAberto, onTogglePainel, onVoltar }: Props) {
  const qc = useQueryClient();
  const { usuarioId, empresaId } = useAudit();
  const id = text(rowId(atendimento));
  const { data: colsMsg } = useCols("atendimentos_mensagem");
  const { data: colsAt } = useCols("atendimentos");
  const [texto, setTexto] = useState("");
  const [interna, setInterna] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [moverAberto, setMoverAberto] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: usuarios = [] } = useTableRows("usuarios");
  const autores = useMemo(
    () => new Map(usuarios.map((u) => [text(rowId(u)), text(pick(u, ["primeiro_nome", "nome", "nome_completo", "email"]))])),
    [usuarios],
  );

  const { data: mensagens = [], isLoading } = useQuery({
    queryKey: ["table", "atendimentos_mensagem", "at", id],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.from("atendimentos_mensagem").select("*").eq("atendimento_id", id);
      if (error) throw error;
      return ((data ?? []) as Row[]).sort(
        (a, b) => (dataDe(a, M.data)?.getTime() ?? 0) - (dataDe(b, M.data)?.getTime() ?? 0),
      );
    },
  });

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length, id]);

  // Zera não lidas ao abrir a conversa.
  useEffect(() => {
    const col = A.naoLidas.find((k) => k in atendimento);
    if (col && Number(atendimento[col]) > 0) {
      void supabase.from("atendimentos").update({ [col]: 0 }).eq("id", id);
    }
  }, [id, atendimento]);

  const nome = nomePessoa(pessoa);
  const kanban = kanbans.find((k) => text(rowId(k)) === text(pick(atendimento, A.kanban)));
  const status = nomeEtapa(atendimento, etapas);
  const encerrado = isEncerrado(atendimento, etapas);
  const ia = isIA(atendimento);
  const souResponsavel = usuarioId !== undefined && text(pick(atendimento, A.responsavel)) === text(usuarioId);

  const barra = texto.startsWith("/") ? texto.slice(1).toLowerCase() : null;
  const sugestoes = useMemo(
    () =>
      barra === null
        ? []
        : notas
            .filter((n) => `${text(n["atalho"])} ${text(n["descricao"])}`.toLowerCase().includes(barra))
            .slice(0, 8),
    [barra, notas],
  );

  async function atualizarAtendimento(values: Row, ok: string) {
    const { error } = await supabase.from("atendimentos").update(filterPayload(values, colsAt)).eq("id", id);
    if (error) {
      console.error(error);
      toast.error(error.message);
      return false;
    }
    qc.invalidateQueries({ queryKey: ["table", "atendimentos"] });
    toast.success(ok);
    return true;
  }

  async function enviar(conteudo: string, extra: Row = {}) {
    if (!conteudo.trim() && !extra["midia_url"]) return;
    setEnviando(true);
    const payload: Row = {
      atendimento_id: id,
      mensagem: conteudo,
      conteudo,
      texto: conteudo,
      tipo: "texto",
      msg_interna: interna,
      from_me: true,
      direcao: "saida",
      usuario_id: usuarioId,
      empresa_id: empresaId,
      ...extra,
    };
    // Notas internas nunca vão para a Z-API: não levam instância.
    if (!interna) payload["instancia_id"] = pick(atendimento, A.instancia);
    if (!interna) payload["status_envio"] = "pendente";
    const { data: salva, error } = await supabase.from("atendimentos_mensagem").insert(filterPayload(payload, colsMsg)).select().single();
    if (error) {
      setEnviando(false);
      console.error(error);
      toast.error(error.message);
      return;
    }
    setTexto("");
    // Handoff silencioso: humano respondeu numa conversa da IA.
    if (!interna && isIA(atendimento)) {
      const et = etapaHumano(etapas, text(pick(atendimento, A.kanban)));
      const { error: eH } = await supabase
        .from("atendimentos")
        .update(filterPayload({ modo: "Humano", modo_atendimento: "Humano", usuario_responsavel_id: usuarioId, ...(et ? etapaPayload(rowId(et), etapas) : {}) }, colsAt))
        .eq("id", id);
      if (eH) console.error(eH);
      else qc.invalidateQueries({ queryKey: ["table", "atendimentos"] });
    }
    if (!interna) {
      const mid = (salva as Row | null)?.["id"];
      try {
        await dispararMensagem({
          instancia,
          mensagemId: mid,
          atendimentoId: id,
          telefone: telefonePessoa(pessoa),
          texto: conteudo,
          midiaUrl: extra["midia_url"] as string | undefined,
          tipo: extra["tipo"] as string | undefined,
          nomeArquivo: extra["nome_arquivo"] as string | undefined,
        });
        await marcarEnvio(mid, "enviado");
      } catch (e) {
        console.error(e);
        await marcarEnvio(mid, "falha");
        toast.error(`Mensagem salva, mas o envio falhou: ${(e as Error).message}`);
      }
    }
    setEnviando(false);
    qc.invalidateQueries({ queryKey: ["table", "atendimentos_mensagem"] });
  }

  async function anexar(file: File) {
    setEnviando(true);
    const path = `${empresaId ?? "geral"}/${id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("chat_media").upload(path, file, file.type ? { contentType: file.type } : undefined);
    setEnviando(false);
    if (up.error) {
      toast.error(`Não foi possível enviar o arquivo: ${up.error.message}`);
      return;
    }
    const url = supabase.storage.from("chat_media").getPublicUrl(path).data.publicUrl;
    const tipo = file.type.startsWith("image/") ? "imagem" : file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : "documento";
    await enviar(texto.trim() || file.name, {
      url_midia: url, midia_url: url, tipo_midia: tipo, tipo, nome_arquivo: file.name,
    });
  }

  async function encerrar() {
    const et = etapaEncerrado(etapas, text(pick(atendimento, A.kanban)));
    if (!et) {
      toast.error('Nenhuma etapa deste quadro está marcada como "Etapa de Encerramento". Marque uma nas configurações do Kanban.');
      return;
    }
    await atualizarAtendimento(etapaPayload(rowId(et), etapas), "Atendimento encerrado.");
  }

  async function assumir() {
    const et = etapaHumano(etapas, text(pick(atendimento, A.kanban)));
    const ok = await atualizarAtendimento(
      { modo: "Humano", modo_atendimento: "Humano", usuario_responsavel_id: usuarioId, ...(et ? etapaPayload(rowId(et), etapas) : {}) },
      "Você assumiu o atendimento.",
    );
    if (ok && usuarioId !== undefined) {
      await supabase.from("atendimentos_participantes").insert({ atendimento_id: id, usuario_id: usuarioId });
      qc.invalidateQueries({ queryKey: ["table", "atendimentos_participantes"] });
    }
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-card px-3 py-2">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onVoltar} aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Avatar className="h-10 w-10">
          {fotoPessoa(pessoa) && <AvatarImage src={fotoPessoa(pessoa)} alt={nome} />}
          <AvatarFallback>{iniciais(nome)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{nome}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {kanban && <span>{text(pick(kanban, ["nome", "descricao"]))}</span>}
            {instancia && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{text(pick(instancia, ["nome", "descricao"]))}</Badge>}
            <Badge variant={encerrado ? "secondary" : "outline"} className="h-5 px-1.5 text-[10px]">
              {status}
            </Badge>
            {ia && !encerrado && (
              <span className="inline-flex items-center gap-1 text-primary"><Bot className="h-3 w-3" /> IA</span>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setMoverAberto(true)} className="hidden sm:inline-flex">
          <MoveRight className="mr-1 h-4 w-4" /> Mover
        </Button>
        {!encerrado && (
          <Button
            variant="ghost"
            size="sm"
            className="hidden lg:inline-flex"
            onClick={encerrar}
          >
            <CheckCircle2 className="mr-1 h-4 w-4" /> Encerrar
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={onTogglePainel} aria-label="Painel do contato">
          {painelAberto ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
        </Button>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-6">
        {isLoading && <p className="text-center text-sm text-muted-foreground">Carregando mensagens…</p>}
        {!isLoading && mensagens.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">Nenhuma mensagem nesta conversa.</p>
        )}
        {mensagens.map((m) => <Balao key={text(rowId(m))} m={m} autores={autores} />)}
        <div ref={fimRef} />
      </div>

      <footer className="border-t border-border bg-card p-3">
        {(ia || !souResponsavel) && !encerrado && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              {ia ? "A IA está conduzindo esta conversa." : "Outro atendente é o responsável."}
            </span>
            <Button size="sm" onClick={assumir}><Hand className="mr-1 h-4 w-4" /> Assumir atendimento</Button>
          </div>
        )}
        {sugestoes.length > 0 && (
          <div className="mb-2 max-h-48 overflow-y-auto rounded-md border border-border bg-popover">
            {sugestoes.map((n) => (
              <button
                key={text(rowId(n))}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => setTexto(text(n["descricao"]))}
              >
                <span className="font-medium text-primary">/{text(n["atalho"])}</span>{" "}
                <span className="text-muted-foreground">{text(n["descricao"]).slice(0, 90)}</span>
              </button>
            ))}
          </div>
        )}
        <div className={cn("flex items-end gap-2 rounded-lg p-1", interna && "bg-warning/15")}>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Emojis"><Smile className="h-5 w-5" /></Button>
            </PopoverTrigger>
            <PopoverContent className="grid w-72 grid-cols-8 gap-1 p-2" align="start">
              {EMOJIS.map((e) => (
                <button key={e} type="button" className="rounded p-1 text-xl hover:bg-accent" onClick={() => setTexto((t) => t + e)}>
                  {e}
                </button>
              ))}
            </PopoverContent>
          </Popover>
          <Button variant="ghost" size="icon" aria-label="Anexar" onClick={() => fileRef.current?.click()}>
            <Paperclip className="h-5 w-5" />
          </Button>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void anexar(f);
              e.target.value = "";
            }}
          />
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar(texto);
              }
            }}
            rows={1}
            placeholder={interna ? "Nota interna (só a equipe vê)…" : "Digite uma mensagem ou / para respostas rápidas"}
            className="max-h-32 min-h-10 flex-1 resize-none"
          />
          <GravadorAudio disabled={enviando} onGravado={(f) => void anexar(f)} />
          <Button size="icon" onClick={() => enviar(texto)} disabled={enviando || !texto.trim()} aria-label="Enviar">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Switch id="nota-interna" checked={interna} onCheckedChange={setInterna} />
          <Label htmlFor="nota-interna" className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Nota interna (apenas equipe)
          </Label>
        </div>
      </footer>

      <MoverDialog
        open={moverAberto}
        onOpenChange={setMoverAberto}
        atendimento={atendimento}
        kanbans={kanbans}
        etapas={etapas}
        onSalvar={(kanbanId, etapaId) =>
          atualizarAtendimento({ kanban_nome_id: kanbanId, ...etapaPayload(etapaId || null, etapas) }, "Atendimento movido.").then(
            (ok) => ok && setMoverAberto(false),
          )
        }
      />
    </section>
  );
}

function Balao({ m, autores }: { m: Row; autores: Map<string, string> }) {
  const interna = m["msg_interna"] === true || m["interna"] === true || m["nota_interna"] === true;
  const cliente = !interna && isCliente(m);
  const tipo = tipoMidia(m);
  const url = pick<string>(m, M.midia);
  const corpo = text(pick(m, M.texto));
  const hora = dataDe(m, M.data)?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const uid = text(pick(m, M.usuario));
  const autor = cliente ? "" : (uid && autores.get(uid)) || (interna ? "" : "Sistema");
  return (
    <div className={cn("flex", cliente ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm sm:max-w-[70%]",
          interna && "border border-warning/40 bg-warning/15 text-foreground",
          !interna && cliente && "rounded-tl-none bg-muted text-foreground",
          !interna && !cliente && "rounded-tr-none bg-primary text-primary-foreground",
        )}
      >
        {interna && (
          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-warning">
            <Lock className="h-3 w-3" /> Nota interna{autor ? ` · ${autor}` : ""}
          </p>
        )}
        {!interna && autor && <p className="mb-0.5 text-xs font-semibold italic opacity-80">{autor}</p>}

        {url && tipo === "imagem" && (
          <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Imagem" className="mb-1 max-h-72 rounded-md" /></a>
        )}
        {url && tipo === "figurinha" && <img src={url} alt="Figurinha" className="h-32 w-32 object-contain" />}
        {url && tipo === "audio" && <audio controls src={url} className="mb-1 max-w-full" />}
        {url && tipo === "video" && <video controls src={url} className="mb-1 max-h-72 rounded-md" />}
        {url && tipo === "documento" && (
          <a href={url} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 underline">
            <FileText className="h-4 w-4" /> {text(m["nome_arquivo"]) || "Abrir documento"}
          </a>
        )}
        {corpo && !(url && corpo === text(m["nome_arquivo"])) && <p className="whitespace-pre-wrap break-words">{corpo}</p>}
        <p className={cn("mt-1 text-right text-[10px] opacity-70")}>{hora}</p>
      </div>
    </div>
  );
}

function MoverDialog({
  open, onOpenChange, atendimento, kanbans, etapas, onSalvar,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  atendimento: Row;
  kanbans: Row[];
  etapas: Row[];
  onSalvar: (kanbanId: string, etapaId: string) => void;
}) {
  const [kanbanId, setKanbanId] = useState("");
  const [etapaId, setEtapaId] = useState("");
  useEffect(() => {
    if (open) {
      setKanbanId(text(pick(atendimento, A.kanban)));
      setEtapaId(text(pick(atendimento, A.etapa)));
    }
  }, [open, atendimento]);
  const etapasDoKanban = etapas
    .filter((e) => text(pick(e, ["kanban_nome_id", "kanban_id"])) === kanbanId && e["status"] !== false)
    .sort((a, b) => Number(a["ordem"] ?? 0) - Number(b["ordem"] ?? 0));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Mover de departamento / etapa</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Departamento</Label>
            <Select value={kanbanId} onValueChange={(v) => { setKanbanId(v); setEtapaId(""); }}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {kanbans.map((k) => (
                  <SelectItem key={text(rowId(k))} value={text(rowId(k))}>{text(pick(k, ["nome", "descricao"]))}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Etapa</Label>
            <Select value={etapaId} onValueChange={setEtapaId} disabled={!kanbanId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {etapasDoKanban.map((e) => (
                  <SelectItem key={text(rowId(e))} value={text(rowId(e))}>{text(pick(e, ["descricao", "nome"]))}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!kanbanId} onClick={() => onSalvar(kanbanId, etapaId)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
