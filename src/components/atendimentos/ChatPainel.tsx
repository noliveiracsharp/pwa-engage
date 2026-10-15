import { comprimirImagem } from "@/lib/image-compress";
import { UploadInfo } from "@/components/ui/upload-info";
import { Linkify } from "@/components/ui/linkify";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useChecklistGate } from "@/components/kanban/ChecklistGate";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Bot, Check, CheckCheck, FileText, Hand, Lock, MoreVertical, MoveRight, Paperclip, PanelRightClose, PanelRightOpen, Send, Smile, CheckCircle2, Loader2, Trash2, Users, Video, Phone, Wrench,
} from "lucide-react";
import { ChamadaFlutuante, duracao, linkConvite, novaSala, type Chamada } from "./ChamadaFlutuante";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  A, M, dataDe, fotoPessoa, iniciais, isCliente, isIA, nomePessoa, tipoMidia,
  telefonePessoa, etapaHumano, etapaEncerrado, etapaPayload, isEncerrado, nomeEtapa,
} from "@/lib/atendimentos";
import { dispararMensagem, marcarEnvio } from "@/lib/atendimentos-envio";
import { GravadorAudio } from "./GravadorAudio";
import { ProtocoloBadge } from "./ProtocoloBadge";
import { ManutencaoSheet } from "@/components/manutencoes/ManutencaoSheet";
import { AvaliacaoSelo, usePesquisaSatisfacao } from "./Pesquisa";
import { ChecklistEventoCard, dataChecklist, useChecklistsAtendimento } from "./ChecklistRespostas";

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
  const [chamada, setChamada] = useState<Chamada | null>(null);
  const participantesRef = useRef<Set<string>>(new Set());
  const [fimChamada, setFimChamada] = useState<{ c: Chamada; fim: number; participantes: string[] } | null>(null);
  const [anotacoes, setAnotacoes] = useState("");
  const pesquisa = usePesquisaSatisfacao();
  const perms = usePagePermissions("/atendimentos");
  const [excluirAberto, setExcluirAberto] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [osAberta, setOsAberta] = useState(false);
  const checklist = useChecklistGate();
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
      const { data, error } = await supabase
        .from("atendimentos_mensagem")
        .select("*")
        .eq("atendimento_id", id)
        .eq("oculta_para_atendente", false);
      if (error) throw error;
      return ((data ?? []) as Row[]).sort(
        (a, b) => (dataDe(a, M.data)?.getTime() ?? 0) - (dataDe(b, M.data)?.getTime() ?? 0),
      );
    },
  });

  // Checklists de etapa entram na linha do tempo como eventos internos (nunca vão ao cliente).
  const { data: checklists = [] } = useChecklistsAtendimento(id);
  const linhaTempo = useMemo(() => {
    const itens: { tipo: "msg" | "ck"; t: number; row: Row }[] = [
      ...mensagens.map((m) => ({ tipo: "msg" as const, t: dataDe(m, M.data)?.getTime() ?? 0, row: m })),
      ...checklists.map((c) => ({ tipo: "ck" as const, t: dataChecklist(c).getTime(), row: c })),
    ];
    return itens.sort((a, b) => a.t - b.t);
  }, [mensagens, checklists]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [linhaTempo.length, id]);

  // Presença em tempo real (digitando / gravando) via broadcast "chat_presence".
  const [presenca, setPresenca] = useState<"composing" | "recording" | null>(null);
  useEffect(() => {
    setPresenca(null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canal = supabase
      .channel("chat_presence")
      .on("broadcast", { event: "*" }, (msg) => {
        const p = ((msg as { payload?: Row }).payload ?? {}) as Row;
        if (text(p["atendimento_id"]) !== text(id)) return;
        const st = text(p["status"]).toLowerCase();
        clearTimeout(timer);
        if (st === "composing" || st === "recording") {
          setPresenca(st);
          timer = setTimeout(() => setPresenca(null), 5000);
        } else setPresenca(null);
      })
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(canal); };
  }, [id]);

  useEffect(() => {
    if (presenca) fimRef.current?.scrollIntoView({ block: "end" });
  }, [presenca]);

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

  async function registrarInterna(conteudo: string) {
    const { error } = await supabase.from("atendimentos_mensagem").insert(
      filterPayload({ atendimento_id: id, mensagem: conteudo, conteudo, texto: conteudo, tipo: "texto", msg_interna: true, usuario_id: usuarioId, empresa_id: empresaId }, colsMsg),
    );
    if (error) console.error(error);
    qc.invalidateQueries({ queryKey: ["table", "atendimentos_mensagem"] });
  }

  async function iniciarChamada(video: boolean) {
    const sala = novaSala();
    const quem = autores.get(text(usuarioId)) || "O atendente";
    const link = linkConvite(sala, video);
    participantesRef.current = new Set();
    setChamada({ sala, video, inicio: Date.now(), iniciador: quem });
    const prev = interna;
    if (prev) setInterna(false);
    await enviarConvite(`${video ? "📹" : "📞"} ${quem} iniciou uma chamada ${video ? "de vídeo" : "de áudio"}. Toque no link para entrar:\n${link}`);
  }

  async function enviarConvite(conteudo: string) {
    // Convite sempre vai para o cliente, mesmo se o modo nota interna estiver ligado.
    const payload: Row = {
      atendimento_id: id, mensagem: conteudo, conteudo, texto: conteudo, tipo: "texto", msg_interna: false,
      usuario_id: usuarioId, empresa_id: empresaId, instancia_id: pick(atendimento, A.instancia), status_envio: "pendente",
    };
    const { data: salva, error } = await supabase.from("atendimentos_mensagem").insert(filterPayload(payload, colsMsg)).select().single();
    if (error) { toast.error(error.message); return; }
    const mid = (salva as Row | null)?.["id"];
    try {
      await dispararMensagem({ instancia, mensagemId: mid, atendimentoId: id, telefone: telefonePessoa(pessoa), texto: conteudo });
      await marcarEnvio(mid, "enviado");
      toast.success("Convite da chamada enviado ao cliente");
    } catch (e) {
      await marcarEnvio(mid, "falha");
      toast.error(`Convite salvo, mas o envio falhou: ${(e as Error).message}`);
    }
    qc.invalidateQueries({ queryKey: ["table", "atendimentos_mensagem"] });
  }

  function encerrarChamada() {
    if (!chamada) return;
    const c = chamada;
    setChamada(null);
    setAnotacoes("");
    setFimChamada({ c, fim: Date.now(), participantes: [...participantesRef.current] });
  }

  async function salvarRegistroChamada() {
    if (!fimChamada) return;
    const { c, fim, participantes } = fimChamada;
    const hora = (t: number) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const linhas = [
      `${REG_CHAMADA} ${c.video ? "de vídeo" : "de áudio"}`,
      `Início: ${hora(c.inicio)} · Término: ${hora(fim)} · Duração: ${duracao(fim - c.inicio)}`,
      `Iniciada por: ${c.iniciador || "Atendente"}`,
      `Participantes: ${[c.iniciador || "Atendente", ...participantes].join(", ")}${participantes.length ? "" : " (ninguém mais entrou)"}`,
    ];
    if (anotacoes.trim()) linhas.push(`Anotações: ${anotacoes.trim()}`);
    setFimChamada(null);
    await registrarInterna(linhas.join("\n"));
  }

  async function anexar(original: File) {
    const file = await comprimirImagem(original, "chat");
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
    await pesquisa.pedir({
      atendimento, pessoa, instancia,
      executar: () => atualizarAtendimento(etapaPayload(rowId(et), etapas), "Atendimento encerrado."),
    });
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

  // Devolve a conversa ao robô: a próxima mensagem do cliente reinicia o fluxo automático.
  async function devolverRobo() {
    const ok = await atualizarAtendimento(
      { modo: "IA", modo_atendimento: "IA", usuario_responsavel_id: null },
      "Atendimento devolvido para o robô.",
    );
    if (!ok) return;
    const { error } = await supabase.from("fluxos_execucoes").delete().eq("atendimento_id", id);
    if (error) console.warn("devolverRobo: execuções", error.message);
    const quem = autores.get(text(usuarioId)) || "Atendente";
    await registrarInterna(`🤖 ${quem} devolveu o atendimento para o robô.`);
  }

  // Exclui o atendimento e tudo que está atrelado a ele (função no banco, em uma única transação).
  async function excluirAtendimento() {
    setExcluindo(true);
    const { error } = await supabase.rpc("excluir_atendimento" as never, { p_id: id } as never);
    setExcluindo(false);
    if (error) {
      toast.error(`Não foi possível excluir: ${error.message}`);
      return;
    }
    setExcluirAberto(false);
    toast.success("Atendimento excluído.");
    onVoltar();
    qc.invalidateQueries({ queryKey: ["table"] });
  }


  return (
    <section className="flex min-w-0 flex-1 flex-col bg-background">
      <header className="flex min-h-16 items-center gap-2 border-b border-border bg-card px-3 py-2">
        <Button variant="ghost" size="icon" className="shrink-0 md:hidden" onClick={onVoltar} aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Avatar className="h-10 w-10 shrink-0">
          {fotoPessoa(pessoa) && <AvatarImage src={fotoPessoa(pessoa)} alt={nome} />}
          <AvatarFallback>{iniciais(nome)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {pessoa?.["is_group"] === true && <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Grupo" />}
            <span className="min-w-0 truncate font-semibold text-foreground">{nome}</span>
            <ProtocoloBadge protocolo={atendimento?.["protocolo"]} className="shrink-0" />
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs text-muted-foreground">
            {kanban && <span className="truncate">{text(pick(kanban, ["nome", "descricao"]))}</span>}
            {instancia && <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">{text(pick(instancia, ["nome", "descricao"]))}</Badge>}
            <Badge variant={encerrado ? "secondary" : "outline"} className="h-5 max-w-40 shrink-0 truncate px-1.5 text-[10px]">
              {status}
            </Badge>
            <AvaliacaoSelo atendimento={atendimento} encerrado={encerrado} />
            {ia && !encerrado && (
              <span className="inline-flex shrink-0 items-center gap-1 text-primary"><Bot className="h-3 w-3" /> IA</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
        {!encerrado && !chamada && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Iniciar chamada" title="Iniciar chamada"><Video className="h-5 w-5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => iniciarChamada(true)}><Video className="mr-2 h-4 w-4" /> Vídeo e áudio</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => iniciarChamada(false)}><Phone className="mr-2 h-4 w-4" /> Apenas áudio</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {chamada && (
          <ChamadaFlutuante
            chamada={chamada}
            nome={autores.get(text(usuarioId)) || "Atendente"}
            titulo={`Chamada com ${nome}`}
            onEncerrar={encerrarChamada}
            onParticipante={(n) => participantesRef.current.add(n)}
          />
        )}
        {!encerrado && (
          <Button variant="outline" size="sm" onClick={encerrar} className="hidden xl:inline-flex">
            <CheckCircle2 className="mr-1 h-4 w-4" /> Encerrar
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Mais ações" title="Mais ações"><MoreVertical className="h-5 w-5" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => setMoverAberto(true)}><MoveRight className="mr-2 h-4 w-4" /> Mover etapa</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOsAberta(true)}><Wrench className="mr-2 h-4 w-4" /> Abrir ordem de manutenção</DropdownMenuItem>
            {!encerrado && !ia && (
              <DropdownMenuItem onSelect={() => void devolverRobo()}><Bot className="mr-2 h-4 w-4" /> Devolver para o Robô</DropdownMenuItem>
            )}
            {!encerrado && (
              <DropdownMenuItem onSelect={() => void encerrar()}><CheckCircle2 className="mr-2 h-4 w-4" /> Encerrar atendimento</DropdownMenuItem>
            )}
            {perms.canDelete && (
              <DropdownMenuItem onSelect={() => setExcluirAberto(true)} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Excluir atendimento
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <ManutencaoSheet
          open={osAberta}
          onOpenChange={setOsAberta}
          record={null}
          inicial={osAberta ? {
            tipo: "corretiva",
            atendimento_id: id,
            pessoa_id: text(rowId(pessoa ?? {})),
            parceiro_id: text(pessoa?.["parceiro_id"]),
            descricao: text(pick([...mensagens].reverse().find((m) => isCliente(m)) ?? {}, ["mensagem", "conteudo", "texto"])),
          } : undefined}
          onSaved={(os) => {
            void supabase.from("atendimentos_mensagem").insert(
              filterPayload({ atendimento_id: id, mensagem: `🔧 Ordem de manutenção ${text(os["numero"])} aberta.`, conteudo: `🔧 Ordem de manutenção ${text(os["numero"])} aberta.`, texto: `🔧 Ordem de manutenção ${text(os["numero"])} aberta.`, tipo: "texto", msg_interna: true, usuario_id: usuarioId, empresa_id: empresaId }, colsMsg),
            ).then(() => qc.invalidateQueries({ queryKey: ["table", "atendimentos_mensagem", "at", id] }));
          }}
        />
        <AlertDialog open={excluirAberto} onOpenChange={(o) => !excluindo && setExcluirAberto(o)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir atendimento?</AlertDialogTitle>
              <AlertDialogDescription>
                Deseja excluir este atendimento permanentemente? Todas as mensagens, anotações internas, etiquetas, participantes, checklists e o andamento do robô serão removidos. Esta ação não poderá ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
              <Button variant="destructive" disabled={excluindo} onClick={excluirAtendimento}>
                {excluindo ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />} Sim, excluir tudo
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button variant="ghost" size="icon" onClick={onTogglePainel} aria-label="Painel do contato">
          {painelAberto ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
        </Button>
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-6">
        {isLoading && <p className="text-center text-sm text-muted-foreground">Carregando mensagens…</p>}
        {!isLoading && mensagens.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">Nenhuma mensagem nesta conversa.</p>
        )}
        {linhaTempo.map((it) =>
          it.tipo === "ck"
            ? <ChecklistEventoCard key={`ck-${text(rowId(it.row))}`} c={it.row} />
            : <Balao key={text(rowId(it.row))} m={it.row} autores={autores} />,
        )}
        <div ref={fimRef} />
      </div>

      <footer className="border-t border-border bg-card p-3">
        {presenca && (
          <div className="mb-2 flex items-center gap-2 px-1 text-xs italic text-primary" aria-live="polite">
            <span className="flex gap-0.5">
              {[0, 150, 300].map((d) => (
                <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
            {presenca === "recording" ? "Cliente está a gravar áudio..." : "Cliente está a escrever..."}
          </div>
        )}
        {(ia || !souResponsavel) && !encerrado && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              {ia ? "A IA está conduzindo esta conversa." : "Outro atendente é o responsável."}
            </span>
            <Button size="sm" onClick={assumir}><Hand className="mr-1 h-4 w-4" /> Assumir atendimento</Button>
          </div>
        )}
        {encerrado ? (
          <div className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            <span>Atendimento encerrado. Mova para outra etapa para reabrir a conversa.</span>
            <Button size="sm" variant="outline" onClick={() => setMoverAberto(true)}>
              <MoveRight className="mr-1 h-4 w-4" /> Reabrir
            </Button>
          </div>
        ) : (
        <>
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
          <UploadInfo perfil="chat" arquivos className="hidden sm:inline-flex" />
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
        </>
        )}
      </footer>

      <Dialog open={!!fimChamada} onOpenChange={(v) => { if (!v) void salvarRegistroChamada(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Chamada encerrada</DialogTitle></DialogHeader>
          {fimChamada && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Duração {duracao(fimChamada.fim - fimChamada.c.inicio)} · Participantes:{" "}
                {[fimChamada.c.iniciador || "Atendente", ...fimChamada.participantes].join(", ")}
              </p>
              <div className="space-y-1">
                <Label htmlFor="anot-chamada">Anotações da chamada</Label>
                <Textarea id="anot-chamada" rows={5} value={anotacoes} onChange={(e) => setAnotacoes(e.target.value)} placeholder="Resuma o que foi tratado, combinados e pendências…" autoFocus />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => void salvarRegistroChamada()}>Salvar no histórico</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MoverDialog
        open={moverAberto}
        onOpenChange={setMoverAberto}
        atendimento={atendimento}
        kanbans={kanbans}
        etapas={etapas}
        onSalvar={(kanbanId, etapaId) => {
          const executar = () =>
            atualizarAtendimento({ kanban_nome_id: kanbanId, ...etapaPayload(etapaId || null, etapas) }, "Atendimento movido.");
          const alvo = etapas.find((e) => text(rowId(e)) === etapaId);
          const vaiEncerrar = alvo?.["is_default_encerrado"] === true && !encerrado;
          const mover = () => (vaiEncerrar ? pesquisa.pedir({ atendimento, pessoa, instancia, executar }) : executar());
          const acao = alvo && checklist.precisa(alvo) ? checklist.exigir({ atendimento, etapa: alvo, executar: mover }) : mover();
          return acao.then((ok) => ok && setMoverAberto(false));
        }}
      />
      {pesquisa.dialog}
      {checklist.dialog}
    </section>
  );
}

function VistoLeitura({ status }: { status: string }) {
  if (status === "lido") return <CheckCheck className="h-3.5 w-3.5 text-lido" aria-label="Lido" />;
  if (status === "entregue") return <CheckCheck className="h-3.5 w-3.5 opacity-70" aria-label="Entregue" />;
  if (status === "enviado") return <Check className="h-3.5 w-3.5 opacity-70" aria-label="Enviado" />;
  return null;
}

function Balao({ m, autores }: { m: Row; autores: Map<string, string> }) {
  const pNome = text(m["participante_grupo_nome"]);
  const pTel = text(m["participante_grupo_telefone"]);
  const participante = pNome && pTel ? `${pNome} · ${pTel}` : pNome || pTel;
  const interna = m["msg_interna"] === true || m["interna"] === true || m["nota_interna"] === true;
  const cliente = !interna && isCliente(m);
  const tipo = tipoMidia(m);
  const url = pick<string>(m, M.midia);
  const corpo = text(pick(m, M.texto));
  const hora = dataDe(m, M.data)?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const uid = text(pick(m, M.usuario));
  const robo = /ia|bot|robo/.test(text(m["remetente_tipo"]).toLowerCase());
  const autor = cliente ? "" : (uid && autores.get(uid)) || (interna ? "" : robo ? "🤖 Robô" : "Sistema");
  const qc = useQueryClient();
  const [menu, setMenu] = useState(false);
  const [apagando, setApagando] = useState(false);
  const mid = rowId(m);
  const tirarDaTela = () => {
    qc.setQueriesData<Row[]>({ queryKey: ["table", "atendimentos_mensagem", "at"] }, (old) =>
      Array.isArray(old) ? old.filter((x) => text(rowId(x)) !== text(mid)) : old,
    );
    qc.invalidateQueries({ queryKey: ["table", "atendimentos_mensagem", "ultimas"] });
  };
  async function apagarParaMim() {
    setApagando(true);
    const { error } = await supabase.from("atendimentos_mensagem").update({ oculta_para_atendente: true }).eq("id", mid as string);
    setApagando(false);
    if (error) { toast.error(`Não foi possível apagar: ${error.message}`); return; }
    tirarDaTela();
    toast.success("Mensagem apagada para você.");
  }
  async function apagarParaTodos() {
    setApagando(true);
    const { data, error } = await supabase.functions.invoke("zapi-delete-msg", {
      body: { id: mid, message_id_zapi: m["message_id_zapi"] ?? null },
    });
    setApagando(false);
    const falha = error?.message || (data && typeof data === "object" && (data as Row)["error"] ? text((data as Row)["error"]) : "");
    if (falha) { toast.error(`Não foi possível apagar para todos: ${falha}`); return; }
    tirarDaTela();
    toast.success("Mensagem apagada para todos.");
  }
  const equipe = !cliente;
  return (
    <div className={cn("flex", cliente ? "justify-start" : "justify-end")}>
      <div
        onContextMenu={equipe ? (e) => { e.preventDefault(); setMenu(true); } : undefined}
        className={cn(
          "group relative max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm sm:max-w-[70%]",
          interna && "border border-warning/40 bg-warning/15 text-foreground",
          !interna && cliente && "rounded-tl-none bg-muted text-foreground",
          !interna && !cliente && "rounded-tr-none bg-primary text-primary-foreground",
          equipe && "pr-7",
        )}
      >
        {equipe && (
          <DropdownMenu open={menu} onOpenChange={setMenu}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Opções da mensagem"
                disabled={apagando}
                className="absolute right-1 top-1 rounded p-0.5 opacity-60 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                {apagando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MoreVertical className="h-3.5 w-3.5" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={apagarParaMim}><Trash2 className="mr-2 h-4 w-4" /> Apagar para mim</DropdownMenuItem>
              {!interna && (
                <DropdownMenuItem onSelect={apagarParaTodos} className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" /> Apagar para todos
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {interna && (
          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-warning">
            <Lock className="h-3 w-3" /> Nota interna{autor ? ` · ${autor}` : ""}
          </p>
        )}
        {!interna && autor && <p className="mb-0.5 text-xs font-semibold italic opacity-80">{autor}</p>}
        {participante && <p className="mb-0.5 text-[11px] font-semibold text-primary">{participante}</p>}

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
        {corpo.startsWith(REG_CHAMADA) ? <RegistroChamada corpo={corpo} /> : corpo && !(url && corpo === text(m["nome_arquivo"])) && <CorpoMsg corpo={corpo} />}
        <p className="mt-1 flex items-center justify-end gap-1 text-[10px]">
          <span className="opacity-70">{hora}</span>
          {!interna && !cliente && <VistoLeitura status={text(m["status_envio"]).toLowerCase()} />}
        </p>
      </div>
    </div>
  );
}

const REG_CHAMADA = "📞 Registro de chamada";

function RegistroChamada({ corpo }: { corpo: string }) {
  const [titulo, ...resto] = corpo.split("\n");
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1 font-semibold"><Phone className="h-4 w-4" /> {titulo?.replace("📞 ", "")}</p>
      {resto.map((l, i) => {
        const [k, ...v] = l.split(": ");
        return (
          <p key={i} className="whitespace-pre-wrap break-words text-xs">
            {v.length && !l.includes(" · ") ? (<><span className="font-semibold">{k}:</span> {v.join(": ")}</>) : l}
          </p>
        );
      })}
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

/** Texto da mensagem; convites de chamada viram cartão com botão "Entrar na chamada". */
function CorpoMsg({ corpo }: { corpo: string }) {
  const link = corpo.match(/https?:\/\/[^\s]+\/chamada\/atendeai-[a-z0-9]+[^\s]*/)?.[0];
  if (!link) return <p className="whitespace-pre-wrap break-words"><Linkify text={corpo} /></p>;
  const video = !link.includes("audio=1");
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1 font-medium">
        {video ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
        {corpo.split("\n")[0]?.replace(/Toque no link para entrar:?/, "").trim()}
      </p>
      <Button asChild size="sm" variant="secondary" className="w-full">
        <a href={link} target="_blank" rel="noreferrer">Entrar na chamada</a>
      </Button>
    </div>
  );
}
