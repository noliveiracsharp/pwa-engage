import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Check, CheckCircle2, FileText, Loader2, Maximize2, Paperclip, Plus, X } from "lucide-react";
import { PlannerPainel, ItemLinha, usePlannerItens } from "@/components/chat-interno/PlannerPainel";
import { TarefaDetalhe } from "@/components/chat-interno/TarefaDetalhe";
import { diaDoItem, ordenar, PRIORIDADES, type Prioridade } from "@/lib/planner";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { comprimirImagem } from "@/lib/image-compress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const T = "tarefas_usuarios";
type Anexo = { url: string; nome: string; tipo: string };

const STATUS: Record<string, { label: string; cls: string }> = {
  aguardando: { label: "Aguardando aceite", cls: "bg-warning/15 text-warning" },
  andamento: { label: "Em andamento", cls: "bg-primary/15 text-primary" },
  recusada: { label: "Recusada", cls: "bg-destructive/15 text-destructive" },
  concluida: { label: "Concluída", cls: "bg-success/15 text-success" },
};

const dataBR = (v: unknown) => {
  const s = String(v ?? "");
  if (!s) return "—";
  const [a, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};
const hoje = () => new Date().toISOString().slice(0, 10);
const tb = () => supabase.from(T as never) as unknown as ReturnType<typeof supabase.from>;

/** Tarefas entre usuários dentro do Chat da equipe, com aceite/recusa justificada. */
export function TarefasChat({ me, empresaId, usuarios, onAvisar }: {
  me: string; empresaId: string; usuarios: Row[];
  onAvisar: (usuarioId: string, texto: string) => Promise<void>;
}) {
  const qc = useQueryClient();
  const [aba, setAba] = useState<"minhas" | "delegadas">("minhas");
  const [visao, setVisao] = useState<"hoje" | "proximos" | "backlog" | "concluidas">("hoje");
  const [expandido, setExpandido] = useState(false);
  const planner = usePlannerItens(me, me);
  const [aberta, setAberta] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const nomes = useMemo(() => new Map(usuarios.map((u) => [String(u["id"]), String(pick(u, ["nome"], "Usuário"))])), [usuarios]);
  const nome = (id: unknown) => (String(id) === me ? "Você" : nomes.get(String(id)) ?? "Usuário");
  const key = ["tarefas-usuarios", me];

  const { data: tarefas = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await tb().select("*").or(`responsavel_id.eq.${me},criado_por.eq.${me}`).order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  useEffect(() => {
    if (!me) return;
    const ch = supabase.channel(`tarefas:${me}`)
      .on("postgres_changes", { event: "*", schema: "public", table: T }, () => void qc.invalidateQueries({ queryKey: key }))
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const lista = tarefas.filter((t) => aba === "minhas" ? String(t["responsavel_id"]) === me && t["status"] === "aguardando" : String(t["criado_por"]) === me && String(t["responsavel_id"]) !== me);
  const ativos = planner.itens.filter((i) => i.status === "aberta" || i.status === "concluida");
  const h = hoje();
  const doDia = ordenar(ativos.filter((i) => {
    const d = diaDoItem(i);
    if (visao === "concluidas") return i.status === "concluida";
    if (i.status === "concluida") return visao === "hoje" && d === h;
    if (visao === "hoje") return !!d && d <= h;
    if (visao === "proximos") return !!d && d > h;
    return !d;
  }));
  const pendentes = tarefas.filter((t) => String(t["responsavel_id"]) === me && t["status"] === "aguardando").length;

  const atualizar = async (t: Row, patch: Record<string, unknown>, aviso: string) => {
    const { error } = await tb().update(patch as never).eq("id", String(t["id"]));
    if (error) { toast.error(error.message); return; }
    void qc.invalidateQueries({ queryKey: key });
    const criador = String(t["criado_por"]);
    if (criador !== me) await onAvisar(criador, aviso).catch(() => undefined);
  };

  const apagarTarefa = async (id: string, titulo: string) => {
    const ok = await confirmar({ title: "Apagar tarefa?", description: `A tarefa "${titulo}" será apagada definitivamente.`, destructive: true });
    if (!ok) return;
    const { data, error } = await tb().delete().eq("id", id).eq("criado_por", me).select("id");
    if (error || !data?.length) { toast.error(error?.message ?? "Não foi possível apagar. Rode o script atendeai-tarefas-apagar.sql no banco."); return; }
    toast.success("Tarefa apagada.");
    void qc.invalidateQueries({ queryKey: key });
  };
  const minhaCriacao = new Map(tarefas.filter((t) => String(t["criado_por"]) === me).map((t) => [String(t["id"]), String(t["titulo"] ?? "")]));

  if (criando) return <NovaTarefa me={me} empresaId={empresaId} usuarios={usuarios} onCancel={() => setCriando(false)} onSaved={async (resp, titulo) => {
    setCriando(false);
    void qc.invalidateQueries({ queryKey: key });
    if (resp !== me) await onAvisar(resp, `📋 Nova tarefa para você: "${titulo}". Abra a aba Tarefas para aceitar ou recusar.`).catch(() => undefined);
  }} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="grid flex-1 grid-cols-2 rounded-md bg-muted p-0.5 text-xs">
          {(["minhas", "delegadas"] as const).map((a) => (
            <button key={a} type="button" onClick={() => setAba(a)} className={cn("rounded px-2 py-1.5 font-medium", aba === a && "bg-background shadow-sm")}>
              {a === "minhas" ? `Minhas${pendentes ? ` (${pendentes})` : ""}` : "Delegadas por mim"}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setCriando(true)}><Plus className="mr-1 h-4 w-4" /> Nova</Button>
        <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Expandir planner" title="Expandir planner" onClick={() => setExpandido(true)}><Maximize2 className="h-4 w-4" /></Button>
      </div>
      <TarefaDetalhe id={aberta} me={me} usuarios={usuarios} onFechar={() => setAberta(null)} onAvisar={onAvisar} />
      {expandido && <PlannerPainel me={me} empresaId={empresaId} usuarios={usuarios} onFechar={() => setExpandido(false)} />}
      {aba === "minhas" && (
        <div className="flex gap-1 px-4 pb-2 text-[11px]">
          {([["hoje", "Hoje"], ["proximos", "Próximos"], ["backlog", "Backlog"], ["concluidas", "Concluídas"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setVisao(v)} className={cn("rounded-full border border-border px-2.5 py-1", visao === v && "border-primary bg-primary/10 text-primary")}>{l}</button>
          ))}
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 px-3 pb-3">
          {isLoading && <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-muted-foreground" />}
          {aba === "minhas" && lista.length > 0 && <p className="pt-1 text-[11px] font-semibold text-warning">Aguardando seu aceite</p>}
          {lista.map((t) => <CardTarefa key={String(t["id"])} t={t} me={me} nome={nome} onAtualizar={atualizar} onApagar={apagarTarefa} />)}
          {aba === "minhas" && doDia.map((i) => (
            <div key={i.id} className="flex items-center gap-1">
              <div className="min-w-0 flex-1"><ItemLinha i={i} nome={(id) => nome(id)} onCheck={(f) => void planner.concluir(i, f)} onAbrir={() => setAberta(i.id)} /></div>
              {i.origem === "tarefa" && minhaCriacao.has(i.id) && (
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-destructive" title="Apagar tarefa" aria-label="Apagar tarefa" onClick={() => void apagarTarefa(i.id, minhaCriacao.get(i.id)!)}><Trash2 className="h-3.5 w-3.5" /></Button>
              )}
              {i.origem === "tarefa" && i.status !== "concluida" && (
                <select aria-label="Planejar para" className="h-7 rounded border border-border bg-background text-[10px]" value=""
                  onChange={(e) => { const v = e.target.value; void planner.planejar(i, v === "backlog" ? null : v === "hoje" ? h : new Date(Date.now() + 864e5).toISOString().slice(0, 10)); }}>
                  <option value="" disabled>Mover…</option>
                  <option value="hoje">Hoje</option><option value="amanha">Amanhã</option><option value="backlog">Backlog</option>
                </select>
              )}
            </div>
          ))}
          {!isLoading && lista.length === 0 && (aba === "delegadas" || doDia.length === 0) && <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma tarefa aqui.</p>}
        </div>
      </ScrollArea>
    </div>
  );
}

function CardTarefa({ t, me, nome, onAtualizar, onApagar }: {
  t: Row; me: string; nome: (id: unknown) => string; onApagar: (id: string, titulo: string) => Promise<void>;
  onAtualizar: (t: Row, patch: Record<string, unknown>, aviso: string) => Promise<void>;
}) {
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const st = STATUS[String(t["status"])] ?? STATUS["aguardando"]!;
  const souResp = String(t["responsavel_id"]) === me;
  const titulo = String(t["titulo"] ?? "");
  const anexos = (Array.isArray(t["anexos"]) ? t["anexos"] : []) as Anexo[];
  const atrasada = t["status"] === "andamento" && !!t["data_entrega"] && String(t["data_entrega"]) < hoje();

  return (
    <div className="rounded-xl border border-border bg-card p-3 text-sm">
      <div className="flex items-start gap-2">
        <p className="flex-1 font-semibold">{titulo}</p>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", st.cls)}>{st.label}</span>
        {String(t["criado_por"]) === me && (
          <Button size="icon" variant="ghost" className="-my-1 h-6 w-6 shrink-0 text-destructive" title="Apagar tarefa" aria-label="Apagar tarefa" onClick={() => void onApagar(String(t["id"]), titulo)}><Trash2 className="h-3.5 w-3.5" /></Button>
        )}
      </div>
      {t["descricao"] ? <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{String(t["descricao"])}</p> : null}
      <div className="mt-2 grid grid-cols-2 gap-x-2 text-[11px] text-muted-foreground">
        <span>De: <b className="text-foreground">{nome(t["criado_por"])}</b></span>
        <span>Para: <b className="text-foreground">{nome(t["responsavel_id"])}</b></span>
        <span>Solicitada: {dataBR(t["data_solicitacao"])}</span>
        <span className={cn(atrasada && "font-semibold text-destructive")}>Entrega: {dataBR(t["data_entrega"])}</span>
      </div>
      {anexos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {anexos.map((a, i) => a.tipo === "imagem"
            ? <a key={i} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.nome} className="h-12 w-12 rounded object-cover" /></a>
            : <a key={i} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs underline"><FileText className="h-3 w-3" />{a.nome}</a>)}
        </div>
      )}
      {t["status"] === "recusada" && t["motivo_recusa"] ? <p className="mt-2 rounded bg-destructive/10 p-2 text-xs text-destructive">Motivo: {String(t["motivo_recusa"])}</p> : null}

      {souResp && t["status"] === "aguardando" && !recusando && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => void onAtualizar(t, { status: "andamento", respondido_em: new Date().toISOString() }, `✅ Aceitei a tarefa "${titulo}".`)}>
            <Check className="mr-1 h-4 w-4" /> Aceitar
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={() => setRecusando(true)}><X className="mr-1 h-4 w-4" /> Recusar</Button>
        </div>
      )}
      {recusando && (
        <div className="mt-3 space-y-2">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por que você está recusando? (obrigatório)" rows={2} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setRecusando(false)}>Cancelar</Button>
            <Button size="sm" variant="destructive" disabled={motivo.trim().length < 3} onClick={() => void onAtualizar(t, { status: "recusada", motivo_recusa: motivo.trim(), respondido_em: new Date().toISOString() }, `❌ Recusei a tarefa "${titulo}". Motivo: ${motivo.trim()}`)}>
              Confirmar recusa
            </Button>
          </div>
        </div>
      )}
      {souResp && t["status"] === "andamento" && (
        <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => void onAtualizar(t, { status: "concluida", concluido_em: new Date().toISOString() }, `🏁 Concluí a tarefa "${titulo}".`)}>
          <CheckCircle2 className="mr-1 h-4 w-4" /> Marcar como concluída
        </Button>
      )}
    </div>
  );
}

export function NovaTarefa({ me, empresaId, usuarios, onCancel, onSaved, responsavelInicial }: {
  me: string; empresaId: string; usuarios: Row[]; onCancel: () => void; responsavelInicial?: string;
  onSaved: (responsavel: string, titulo: string) => Promise<void>;
}) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [resp, setResp] = useState(responsavelInicial ?? me);
  const [entrega, setEntrega] = useState("");
  const [prioridade, setPrioridade] = useState<Prioridade>("media");
  const [estimativa, setEstimativa] = useState("");
  const [planejada, setPlanejada] = useState(hoje());
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [enviando, setEnviando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const anexar = async (files: FileList) => {
    setEnviando(true);
    for (const original of Array.from(files)) {
      const file = await comprimirImagem(original, "chat");
      const path = `tarefas/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
      const up = await supabase.storage.from("chat_media").upload(path, file, file.type ? { contentType: file.type } : undefined);
      if (up.error) { toast.error(up.error.message); continue; }
      const url = supabase.storage.from("chat_media").getPublicUrl(path).data.publicUrl;
      setAnexos((a) => [...a, { url, nome: file.name, tipo: file.type.startsWith("image/") ? "imagem" : "documento" }]);
    }
    setEnviando(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const salvar = async () => {
    if (!titulo.trim()) { toast.error("Informe o título da tarefa."); return; }
    setEnviando(true);
    const { error } = await tb().insert({
      empresa_id: empresaId, criado_por: me, responsavel_id: resp, titulo: titulo.trim(),
      descricao: descricao.trim() || null, data_solicitacao: hoje(), data_entrega: entrega || null, anexos,
      status: resp === me ? "andamento" : "aguardando",
      prioridade, estimativa_min: estimativa ? Math.max(1, Math.round(Number(estimativa))) : null,
      data_planejada: resp === me ? planejada || null : null,
    } as never);
    setEnviando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(resp === me ? "Tarefa criada." : "Tarefa enviada. Aguardando aceite.");
    await onSaved(resp, titulo.trim());
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4">
          <div className="space-y-1"><Label>Título</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="O que precisa ser feito?" /></div>
          <div className="space-y-1">
            <Label>Responsável</Label>
            <Select value={resp} onValueChange={setResp}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={me}>Eu mesmo</SelectItem>
                {usuarios.map((u) => <SelectItem key={String(u["id"])} value={String(u["id"])}>{String(pick(u, ["nome"], "Usuário"))}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>Solicitação</Label><Input type="date" value={hoje()} disabled /></div>
            <div className="space-y-1"><Label>Previsão de entrega</Label><Input type="date" value={entrega} min={hoje()} onChange={(e) => setEntrega(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={(v) => setPrioridade(v as Prioridade)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{[...PRIORIDADES].sort((a, b) => a.label.localeCompare(b.label, "pt-BR")).map((p) => <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Tempo (min)</Label><Input type="number" min={1} value={estimativa} onChange={(e) => setEstimativa(e.target.value)} placeholder="Opcional" /></div>
            <div className="space-y-1"><Label>Fazer em</Label><Input type="date" value={planejada} disabled={resp !== me} onChange={(e) => setPlanejada(e.target.value)} title="Deixe vazio para ir ao backlog" /></div>
          </div>
          <div className="space-y-1"><Label>Descrição</Label><Textarea rows={4} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
          <div className="space-y-1">
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => e.target.files?.length && void anexar(e.target.files)} />
            <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={enviando}><Paperclip className="mr-1 h-4 w-4" /> Anexar arquivos</Button>
            {anexos.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <FileText className="h-3 w-3" /><span className="flex-1 truncate">{a.nome}</span>
                <button type="button" aria-label="Remover anexo" onClick={() => setAnexos((x) => x.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
      <div className="flex justify-end gap-2 border-t border-border p-3">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={() => void salvar()} disabled={enviando}>{enviando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Salvar</Button>
      </div>
    </div>
  );
}
