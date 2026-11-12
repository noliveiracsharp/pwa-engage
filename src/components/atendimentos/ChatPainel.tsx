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
  ArrowLeft, Ban, Bot, CornerUpLeft, Link2, Check, CheckCheck, FileText, Hand, Lock, MoreVertical, MoveRight, Paperclip, PanelRightClose, PanelRightOpen, Send, Smile, CheckCircle2, Loader2, Trash2, Users, Video, Phone, Wrench,
} from "lucide-react";
import { CitacaoNoBalao, FaixaResposta, lerCitacao, type Citacao } from "@/components/chat/Citacao";
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
import { dispararMensagem, editarMensagemZapi, marcarEnvio } from "@/lib/atendimentos-envio";
import { X, Pencil } from "lucide-react";
import { GravadorAudio } from "./GravadorAudio";
import { SinoBotao, SinoTarja, desarmarSino } from "./SinoAtendimento";
import { TranscricaoAudio } from "./TranscricaoAudio";
import { transcreverChamada } from "@/lib/chamada-transcricao.functions";
import { ProtocoloBadge } from "./ProtocoloBadge";
import { bloquearContato, SeloBloqueado, useBloqueados } from "./Bloqueios";
import { perguntar } from "@/components/layout/DialogoGlobal";
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

const RASCUNHOS = new Map<string, string>();
/** Mensagens apagadas nesta sessão: o refetch nunca as traz de volta. */
const APAGADAS = new Set<string>();
const EDITADAS = new Map<string, string>();

export function ChatPainel({ atendimento, pessoa, instancia, kanbans, etapas, notas, painelAberto, onTogglePainel, onVoltar }: Props) {
  const qc = useQueryClient();
  const { usuarioId, empresaId } = useAudit();
  const bloqueioDe = useBloqueados(empresaId);
  const bloqueio = bloqueioDe(telefonePessoa(pessoa));
  const id = text(rowId(atendimento));
  const { data: colsMsg } = useCols("atendimentos_mensagem");
  const { data: colsAt } = useCols("atendimentos");
  const [texto, setTextoBruto] = useState(() => RASCUNHOS.get(id) ?? "");
  // Rascunho isolado por conversa: trocar de atendimento nunca leva o texto para outro cliente.
  const idRef = useRef(id);
  const setTexto = (v: string | ((t: string) => string)) =>
    setTextoBruto((atual) => {
      const novo = typeof v === "function" ? v(atual) : v;
      if (novo) RASCUNHOS.set(idRef.current, novo); else RASCUNHOS.delete(idRef.current);
      return novo;
    });
  useEffect(() => {
    if (idRef.current === id) return;
    idRef.current = id;
    setTextoBruto(RASCUNHOS.get(id) ?? "");
  }, [id]);
  const [respondendo, setRespondendo] = useState<Citacao | null>(null);
  const [interna, setInterna] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pendentes, setPendentes] = useState<{ file: File; url: string }[]>([]);
  useEffect(() => () => pendentes.forEach((p) => URL.revokeObjectURL(p.url)), [pendentes]);
  useEffect(() => { setPendentes([]); }, [id]);
  const adicionarPendentes = (files: File[]) =>
    setPendentes((atual) => [...atual, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, 10));
  async function enviarTudo() {
    if (!pendentes.length) { await enviar(texto); return; }
    const lista = pendentes; const legenda = texto.trim();
    setPendentes([]);
    for (let i = 0; i < lista.length; i++) await anexar(lista[i]!.file, i === 0 ? legenda : "");
    setTexto("");
  }
  const [moverAberto, setMoverAberto] = useState(false);
  const [chamada, setChamada] = useState<Chamada | null>(null);
  const participantesRef = useRef<Set<string>>(new Set());
  const [fimChamada, setFimChamada] = useState<{ c: Chamada; fim: number; participantes: string[] } | null>(null);
  const [anotacoes, setAnotacoes] = useState("");
  const [transcrevendo, setTranscrevendo] = useState(false);
  async function transcreverGravacao(audio: Blob) {
    setTranscrevendo(true);
    try {
      const buf = new Uint8Array(await audio.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const r = await transcreverChamada({ data: { audio: btoa(bin), tipo: audio.type, participantes: [...participantesRef.current].join(", ") } });
      if (r.erro || !r.texto) toast.error(r.erro ?? "Não foi possível transcrever a chamada.");
      else setAnotacoes((a) => (a.trim() ? `${a.trim()}\n\n` : "") + r.texto);
    } catch {
      toast.error("Não foi possível transcrever a chamada.");
    } finally {
      setTranscrevendo(false);
    }
  }
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
    refetchInterval: 3000,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("atendimentos_mensagem")
        .select("*")
        .eq("atendimento_id", id)
        .eq("oculta_para_atendente", false);
      if (error) throw error;
      return ((data ?? []) as Row[])
        .filter((m) => m["apagada_para_todos"] !== true && !APAGADAS.has(text(rowId(m))))
        .map((m) => { const e = EDITADAS.get(text(rowId(m))); return e === undefined ? m : { ...m, mensagem: e, conteudo: e, texto: e }; })
        .sort(
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
      ...(respondendo ? { citacao: respondendo } : {}),
      ...extra,
    };
    const citada = respondendo;
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
    setRespondendo(null);
    if (!interna) void desarmarSino(id, atendimento, colsAt).then(() => qc.invalidateQueries({ queryKey: ["table", "atendimentos"] }));
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
          texto: comAssinatura(conteudo),
          midiaUrl: extra["midia_url"] as string | undefined,
          tipo: extra["tipo"] as string | undefined,
          nomeArquivo: extra["nome_arquivo"] as string | undefined,
          responderA: citada?.externo ?? null,
        }).then((zid) => marcarEnvio(mid, "enviado", zid));
      } catch (e) {
        console.error(e);
        await marcarEnvio(mid, "falha");
        toast.error(`Mensagem salva, mas o envio falhou: ${(e as Error).message}`);
      }
    }
    setEnviando(false);
    qc.invalidateQueries({ queryKey: ["table", "atendimentos_mensagem"] });
  }

  /** Nome do atendente em negrito no início da mensagem do WhatsApp. */
  function comAssinatura(c: string) {
    const quem = autores.get(text(usuarioId));
    return quem && c.trim() ? `*${quem}:*\n${c}` : c;
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

  async function enviarConvite(conteudo: string, ok = "Convite da chamada enviado ao cliente") {
    // Convite sempre vai para o cliente, mesmo se o modo nota interna estiver ligado.
    const payload: Row = {
      atendimento_id: id, mensagem: conteudo, conteudo, texto: conteudo, tipo: "texto", msg_interna: false,
      usuario_id: usuarioId, empresa_id: empresaId, instancia_id: pick(atendimento, A.instancia), status_envio: "pendente",
    };
    const { data: salva, error } = await supabase.from("atendimentos_mensagem").insert(filterPayload(payload, colsMsg)).select().single();
    if (error) { toast.error(error.message); return; }
    const mid = (salva as Row | null)?.["id"];
    try {
      const zid = await dispararMensagem({ instancia, mensagemId: mid, atendimentoId: id, telefone: telefonePessoa(pessoa), texto: conteudo });
      await marcarEnvio(mid, "enviado", zid);
      toast.success(ok);
    } catch (e) {
      await marcarEnvio(mid, "falha");
      toast.error(`Convite salvo, mas o envio falhou: ${(e as Error).message}`);
    }
    qc.invalidateQueries({ queryKey: ["table", "atendimentos_mensagem"] });
  }

  const sinoProps = {
    atendimentoId: id, atendimento, colsAt, nomeCliente: nome, encerrado,
    enviar: (c: string) => enviarConvite(c, "Aviso de espera enviado ao cliente"),
    onChange: () => void qc.invalidateQueries({ queryKey: ["table", "atendimentos"] }),
  };

  const linkPortal = () => `${window.location.origin}/portal?tel=${encodeURIComponent(telefonePessoa(pessoa).replace(/\D/g, ""))}`;
  async function copiarPortal() {
    await navigator.clipboard.writeText(linkPortal());
    toast.success("Link do Portal do Cliente copiado");
  }
  async function enviarPortal() {
    const primeiro = nome.split(" ")[0] || "";
    await enviarConvite(`Olá${primeiro ? ` ${primeiro}` : ""}! Você pode acompanhar este atendimento e todo o seu histórico pelo link:\n${linkPortal()}`, "Link do Portal enviado ao cliente");
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

  async function anexar(original: File, legenda = "") {
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
    await enviar(legenda, {
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

  /** Spam: bloqueia o número e encerra sem pesquisa de satisfação. */
  async function bloquearSpam() {
    const tel = telefonePessoa(pessoa);
    const motivo = await perguntar({ title: "Bloquear contato", description: "Mensagens deste número passam a ser ignoradas e o atendimento é encerrado.", defaultValue: "Spam", placeholder: "Motivo", confirmText: "Bloquear" });
    if (motivo === null) return;
    const ok = await bloquearContato({ empresaId, telefone: tel, nome: text(pick(pessoa ?? {}, ["nome", "razao_social"])), motivo, usuarioId });
    if (!ok) return;
    void qc.invalidateQueries({ queryKey: ["atendimentos-bloqueios"] });
    const et = etapaEncerrado(etapas, text(pick(atendimento, A.kanban)));
    if (et && !encerrado) await atualizarAtendimento(etapaPayload(rowId(et), etapas), "Contato bloqueado e atendimento encerrado.");
    else toast.success("Contato bloqueado.");
  }

  async function reabrir() {
    const et = etapaHumano(etapas, text(pick(atendimento, A.kanban)));
    if (!et) { setMoverAberto(true); return; }
    await atualizarAtendimento(
      { modo: "Humano", modo_atendimento: "Humano", usuario_responsavel_id: usuarioId, ...etapaPayload(rowId(et), etapas) },
      "Atendimento reaberto no mesmo protocolo.",
    );
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
            {bloqueio && <SeloBloqueado motivo={bloqueio.motivo} />}
            {ia && !encerrado && (
              <span className="inline-flex shrink-0 items-center gap-1 text-primary"><Bot className="h-3 w-3" /> IA</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
        <SinoBotao {...sinoProps} />
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
            onGravacao={(a) => void transcreverGravacao(a)}
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
            <DropdownMenuItem onSelect={() => void enviarPortal()} disabled={!telefonePessoa(pessoa)}><Send className="mr-2 h-4 w-4" /> Enviar link do Portal</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void copiarPortal()} disabled={!telefonePessoa(pessoa)}><Link2 className="mr-2 h-4 w-4" /> Copiar link do Portal</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMoverAberto(true)}><MoveRight className="mr-2 h-4 w-4" /> Mover etapa</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOsAberta(true)}><Wrench className="mr-2 h-4 w-4" /> Abrir ordem de manutenção</DropdownMenuItem>
            {!encerrado && !ia && (
              <DropdownMenuItem onSelect={() => void devolverRobo()}><Bot className="mr-2 h-4 w-4" /> Devolver para o Robô</DropdownMenuItem>
            )}
            {!encerrado && (
              <DropdownMenuItem onSelect={() => void encerrar()}><CheckCircle2 className="mr-2 h-4 w-4" /> Encerrar atendimento</DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => void bloquearSpam()} disabled={!telefonePessoa(pessoa) || !!bloqueio} className="text-destructive focus:text-destructive"><Ban className="mr-2 h-4 w-4" /> Bloquear contato (spam)</DropdownMenuItem>
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
      <SinoTarja {...sinoProps} />

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-6">
        {isLoading && <p className="text-center text-sm text-muted-foreground">Carregando mensagens…</p>}
        {!isLoading && mensagens.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">Nenhuma mensagem nesta conversa.</p>
        )}
        {linhaTempo.map((it) =>
          it.tipo === "ck"
            ? <ChecklistEventoCard key={`ck-${text(rowId(it.row))}`} c={it.row} />
            : <Balao key={text(rowId(it.row))} m={it.row} autores={autores} onResponder={(c) => setRespondendo(c)} onEditarWhats={(zid, t) => editarMensagemZapi(instancia, telefonePessoa(pessoa), zid, comAssinatura(t))} />,
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
            <span>Atendimento encerrado. Você pode reabrir no mesmo protocolo.</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void reabrir()}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Reabrir protocolo
              </Button>
              <Button size="sm" variant="outline" onClick={() => setMoverAberto(true)}>
                <MoveRight className="mr-1 h-4 w-4" /> Mover etapa
              </Button>
            </div>
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
        {pendentes.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 rounded-md border border-border bg-muted/40 p-2" aria-label="Arquivos para enviar">
            {pendentes.map((p, i) => (
              <div key={p.url} className="relative h-20 w-20 overflow-hidden rounded-md border border-border bg-background">
                {p.file.type.startsWith("image/") ? (
                  <img src={p.url} alt={`Prévia ${i + 1}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-1 p-1 text-center text-[10px] text-muted-foreground"><FileText className="h-5 w-5" /><span className="line-clamp-2 break-all">{p.file.name}</span></div>
                )}
                <button type="button" aria-label="Remover arquivo" onClick={() => setPendentes((a) => a.filter((x) => x.url !== p.url))}
                  className="absolute right-0.5 top-0.5 rounded-full bg-background/90 p-0.5 text-foreground shadow"><X className="h-3 w-3" /></button>
              </div>
            ))}
            <p className="w-full text-xs text-muted-foreground">Escreva uma legenda (opcional) e clique em Enviar. A legenda vai na primeira imagem.</p>
          </div>
        )}
        {respondendo && <FaixaResposta citacao={respondendo} onCancelar={() => setRespondendo(null)} />}
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
            multiple
            hidden
            accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? []);
              if (fs.length) adicionarPendentes(fs);
              e.target.value = "";
            }}
          />
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onPaste={(e) => {
              const arquivos = Array.from(e.clipboardData.items)
                .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
                .map((it) => it.getAsFile())
                .filter((f): f is File => !!f);
              if (!arquivos.length || enviando) return;
              e.preventDefault();
              adicionarPendentes(arquivos.map((f, i) => new File([f], `imagem-${Date.now()}-${i}.${f.type.split("/")[1] || "png"}`, { type: f.type })));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviarTudo();
              }
            }}
            rows={1}
            placeholder={interna ? "Nota interna (só a equipe vê)…" : "Digite uma mensagem ou / para respostas rápidas"}
            className="max-h-32 min-h-10 flex-1 resize-none"
          />
          <GravadorAudio disabled={enviando} onGravado={(f) => void anexar(f)} />
          <Button size="icon" onClick={() => void enviarTudo()} disabled={enviando || (!texto.trim() && !pendentes.length)} aria-label="Enviar">
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
                {transcrevendo && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Transcrevendo e resumindo a gravação com IA…</p>}
                <Textarea id="anot-chamada" rows={transcrevendo ? 5 : 10} value={anotacoes} onChange={(e) => setAnotacoes(e.target.value)} placeholder="Resuma o que foi tratado, combinados e pendências…" autoFocus />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button disabled={transcrevendo} onClick={() => void salvarRegistroChamada()}>Salvar no histórico</Button>
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
          const trocouDep = kanbanId !== text(pick(atendimento, A.kanban));
          const executar = async () => {
            const ok = await atualizarAtendimento(
              { kanban_nome_id: kanbanId, ...etapaPayload(etapaId || null, etapas), ...(trocouDep ? { usuario_responsavel_id: null } : {}) },
              trocouDep ? "Atendimento transferido de departamento." : "Atendimento movido.",
            );
            if (ok && trocouDep && usuarioId !== undefined) {
              // Quem transferiu continua acompanhando como participante; a nova equipe assume pela fila.
              await supabase.from("atendimentos_participantes").insert({ atendimento_id: id, usuario_id: usuarioId });
              qc.invalidateQueries({ queryKey: ["table", "atendimentos_participantes"] });
              const destino = text(pick(kanbans.find((k) => text(rowId(k)) === kanbanId), ["nome", "descricao"]));
              await registrarInterna(`↪️ ${autores.get(text(usuarioId)) || "Atendente"} transferiu o atendimento para ${destino}.`);
            }
            return ok;
          };
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

function Balao({ m, autores, onResponder, onEditarWhats }: { m: Row; autores: Map<string, string>; onResponder: (c: Citacao) => void; onEditarWhats?: (zid: string, t: string) => Promise<unknown> }) {
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
    APAGADAS.add(text(mid));
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
  async function editar() {
    const novo = await perguntar({ title: "Editar mensagem", description: "O texto será corrigido aqui e no WhatsApp do cliente.", defaultValue: corpo, placeholder: "Mensagem", confirmText: "Salvar" });
    if (novo === null || !novo.trim() || novo === corpo) return;
    setApagando(true);
    const { error } = await supabase.from("atendimentos_mensagem").update({ mensagem: novo, conteudo: novo, texto: novo } as never).eq("id", mid as string);
    if (error) console.error(error);
    EDITADAS.set(text(mid), novo);
    qc.setQueriesData<Row[]>({ queryKey: ["table", "atendimentos_mensagem", "at"] }, (old) =>
      Array.isArray(old) ? old.map((x) => (text(rowId(x)) === text(mid) ? { ...x, mensagem: novo, conteudo: novo, texto: novo } : x)) : old);
    const zid = text(m["message_id_zapi"]);
    if (!interna && zid && onEditarWhats) {
      try { await onEditarWhats(zid, novo); } catch (e) { toast.error(`Corrigido aqui, mas o WhatsApp recusou a edição: ${(e as Error).message}`); setApagando(false); return; }
    }
    setApagando(false);
    toast.success("Mensagem editada.");
  }
  const equipe = !cliente;
  const citacao = lerCitacao(m["citacao"]);
  const responder = () =>
    onResponder({
      id: text(mid),
      autor: cliente ? text(m["nome_contato"]) || "Cliente" : interna ? "Nota interna" : autor || "Você",
      texto: corpo || text(m["nome_arquivo"]) || tipo || "Mídia",
      // Nota interna não existe no WhatsApp: sem citação nativa.
      externo: interna ? null : text(cliente ? m["externo_id"] : m["message_id_zapi"]) || null,
    });
  return (
    <div id={`msg-${text(mid)}`} className={cn("group/msg flex items-center gap-1 transition", cliente ? "justify-start" : "flex-row-reverse justify-start")}>
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
              {(!url || !tipo || tipo === "texto") && corpo && <DropdownMenuItem onSelect={() => void editar()}><Pencil className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>}
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
        {citacao && <CitacaoNoBalao citacao={citacao} claro={!interna && !cliente} />}
        {participante && <p className="mb-0.5 text-[11px] font-semibold text-primary">{participante}</p>}

        {url && tipo === "imagem" && (
          <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Imagem" className="mb-1 max-h-72 rounded-md" /></a>
        )}
        {url && tipo === "figurinha" && <img src={url} alt="Figurinha" className="h-32 w-32 object-contain" />}
        {url && tipo === "audio" && <audio controls src={url} className="mb-1 max-w-full" />}
        {url && tipo === "audio" && <TranscricaoAudio mensagemId={text(mid)} url={url} salva={text(m["transcricao"])} />}
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
      <Button
        type="button" variant="ghost" size="icon" tooltip="Responder" aria-label="Responder"
        className="h-7 w-7 shrink-0 opacity-60 transition sm:opacity-0 sm:group-hover/msg:opacity-100 focus-visible:opacity-100"
        onClick={responder}
      >
        <CornerUpLeft className="h-3.5 w-3.5" />
      </Button>
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
