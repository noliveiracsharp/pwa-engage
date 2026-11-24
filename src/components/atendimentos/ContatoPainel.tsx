import { useChecklistGate } from "@/components/kanban/ChecklistGate";
import { etiquetasDoQuadro } from "@/lib/etiquetas";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Tag, X, Pencil, ArrowRightLeft } from "lucide-react";
import { perguntar } from "@/components/layout/DialogoGlobal";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StarRating } from "@/components/data-table/StarRating";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PessoaCampos } from "@/components/pessoas/PessoaCampos";
import { rowId, text } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { A, corEtiqueta, etapaPayload, etapasDoKanban, fotoPessoa, iniciais, nomePessoa, telefonePessoa } from "@/lib/atendimentos";
import { filterPayload, useCols } from "@/lib/projetos";
import { usePesquisaSatisfacao } from "./Pesquisa";
import { ChecklistsPainel } from "./ChecklistRespostas";
import { useAuth } from "@/hooks/useAuth";

type Props = {
  atendimento: Row;
  pessoa: Row | undefined;
  usuarios: Row[];
  participantes: Row[];
  etiquetas: Row[];
  vinculosEtiqueta: Row[];
  kanbans: Row[];
  etapas: Row[];
  kanbansDestino: Row[];
  instancia?: Row | undefined;
  onFechar: () => void;
};

const nomeUsuario = (u: Row | undefined) => pick<string>(u, ["nome", "nome_completo", "email"], "Usuário") ?? "";

export function ContatoPainel({ atendimento, pessoa, usuarios, participantes, etiquetas, vinculosEtiqueta, kanbans, kanbansDestino, etapas, instancia, onFechar }: Props) {
  const qc = useQueryClient();
  const { data: colsAt } = useCols("atendimentos");
  const atId = text(rowId(atendimento));
  const pessoaId = pessoa ? rowId(pessoa) : undefined;
  const nome = nomePessoa(pessoa);
  const [obs, setObs] = useState("");
  const obsCol = ["observacoes", "observacao", "obs"].find((k) => pessoa && k in pessoa) ?? "observacoes";
  const avCol = ["avaliacao", "estrelas", "nota"].find((k) => pessoa && k in pessoa) ?? "avaliacao";
  useEffect(() => setObs(text(pessoa?.[obsCol])), [pessoa, obsCol]);

  async function salvarPessoa(values: Row) {
    if (pessoaId === undefined) return;
    const { error } = await supabase.from("pessoas").update(values).eq("id", pessoaId as never);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["table", "pessoas"] });
  }

  const meusPart = participantes.filter((p) => text(pick(p, ["atendimento_id"])) === atId);
  const partIds = new Set(meusPart.map((p) => text(p["usuario_id"])));
  const responsavel = text(pick(atendimento, A.responsavel));
  if (responsavel) partIds.add(responsavel);

  async function convidar(usuarioId: string) {
    const { error } = await supabase.from("atendimentos_participantes").insert({ atendimento_id: atId, usuario_id: usuarioId });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["table", "atendimentos_participantes"] });
    toast.success("Atendente convidado.");
  }
  async function removerPart(usuarioId: string) {
    const { error } = await supabase.from("atendimentos_participantes").delete().eq("atendimento_id", atId).eq("usuario_id", usuarioId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["table", "atendimentos_participantes"] });
  }

  const minhasEt = new Set(
    vinculosEtiqueta.filter((v) => text(pick(v, ["atendimento_id"])) === atId).map((v) => text(pick(v, ["etiqueta_id", "etiquetas_id"]))),
  );
  async function toggleEtiqueta(etId: string) {
    const q = minhasEt.has(etId)
      ? supabase.from("atendimentos_etiqueta").delete().eq("atendimento_id", atId).eq("etiqueta_id", etId)
      : supabase.from("atendimentos_etiqueta").insert({ atendimento_id: atId, etiqueta_id: etId });
    const { error } = await q;
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["table", "atendimentos_etiqueta"] });
  }

  const kanban = kanbans.find((k) => text(rowId(k)) === text(pick(atendimento, A.kanban)));
  const etapa = etapas.find((e) => text(rowId(e)) === text(pick(atendimento, A.etapa)));
  const pesquisa = usePesquisaSatisfacao();
  const checklist = useChecklistGate();
  async function aplicarEtapa(etId: string, encerrando = false) {
    // Ao encerrar, quem encerra fica como responsável (a avaliação vai para ele).
    const body = { ...etapaPayload(etId, etapas), ...(encerrando && meuId ? { usuario_responsavel_id: meuId } : {}) };
    const { error } = await supabase.from("atendimentos").update(filterPayload(body, colsAt)).eq("id", atId);
    if (error) { toast.error(error.message); return false; }
    qc.invalidateQueries({ queryKey: ["table", "atendimentos"] });
    toast.success("Etapa atualizada.");
    return true;
  }
  async function mudarEtapa(etId: string) {
    const alvo = etapas.find((e) => text(rowId(e)) === etId);
    const mover = async (): Promise<boolean> => {
      if (alvo?.["is_default_encerrado"] === true && etapa?.["is_default_encerrado"] !== true) {
        return pesquisa.pedir({ atendimento, pessoa, executar: () => aplicarEtapa(etId, true) });
      }
      return aplicarEtapa(etId);
    };
    if (alvo && checklist.precisa(alvo)) await checklist.exigir({ atendimento, etapa: alvo, executar: mover });
    else await mover();
  }
  const { usuario } = useAuth();
  const meuId = usuario ? text(rowId(usuario)) : "";
  const { data: colsMsg } = useCols("atendimentos_mensagem");
  async function notaInterna(msg: string) {
    await supabase.from("atendimentos_mensagem").insert(filterPayload({
      atendimento_id: atId, mensagem: msg, conteudo: msg, texto: msg, msg_interna: true, usuario_id: meuId || null, remetente_tipo: "atendente",
    }, colsMsg) as never);
    void qc.invalidateQueries({ queryKey: ["table", "atendimentos_mensagem", "at", atId] });
  }
  // Atualiza a lista na hora (sem esperar o banco), para o card sair/mudar imediatamente.
  function otimista(patch: Row) {
    qc.setQueriesData<Row[]>({ queryKey: ["table", "atendimentos"] }, (rows) =>
      Array.isArray(rows) ? rows.map((r) => (text(rowId(r)) === atId ? { ...r, ...patch } : r)) : rows);
  }
  // Update tolerante: se o cache de colunas falhar, remove a coluna inexistente apontada pelo banco e tenta de novo.
  async function atualizarAt(payload: Row) {
    let body = filterPayload(payload, colsAt);
    for (let i = 0; i < 6; i++) {
      const { error } = await supabase.from("atendimentos").update(body as never).eq("id", atId);
      const col = error?.code === "PGRST204" ? /'([^']+)' column/.exec(error.message)?.[1] : undefined;
      if (!col || !(col in body)) return { error };
      body = Object.fromEntries(Object.entries(body).filter(([k]) => k !== col));
    }
    return { error: null };
  }
  async function transferirAtendente(novoId: string) {
    if (!novoId || novoId === responsavel) return;
    const de = nomeUsuario(usuarios.find((u) => text(rowId(u)) === responsavel));
    const para = nomeUsuario(usuarios.find((u) => text(rowId(u)) === novoId));
    const { error } = await atualizarAt({ usuario_responsavel_id: novoId, modo: "Humano", modo_atendimento: "Humano" });
    if (error) { toast.error(error.message); return; }
    otimista({ usuario_responsavel_id: novoId, modo: "Humano", modo_atendimento: "Humano" });
    if (responsavel && !meusPart.some((p) => text(p["usuario_id"]) === responsavel)) {
      await supabase.from("atendimentos_participantes").insert({ atendimento_id: atId, usuario_id: responsavel });
      void qc.invalidateQueries({ queryKey: ["table", "atendimentos_participantes"] });
    }
    await notaInterna(`🔀 Atendimento transferido${responsavel ? ` de ${de}` : ""} para ${para}.`);
    void qc.invalidateQueries({ queryKey: ["table", "atendimentos"] });
    toast.success(`Transferido para ${para}.`);
  }
  async function transferirKanban(kbId: string) {
    if (!kbId || kbId === text(pick(atendimento, A.kanban))) return;
    const destino = kanbansDestino.find((k) => text(rowId(k)) === kbId);
    // Primeira etapa HUMANA do departamento (pula etapas de IA/robô) para cair em "Aguardando".
    const doKb = etapasDoKanban(etapas, kbId);
    const primeira = doKb.find((e) => !/\b(ia|bot|rob[oô])\b/i.test(text(pick(e, ["nome", "descricao"])))) ?? doKb[0];
    // Libera o responsável e marca modo humano: o chamado entra na fila "Aguardando" do novo departamento.
    const payload: Row = { kanban_nome_id: kbId, usuario_responsavel_id: null, modo: "Humano", modo_atendimento: "Humano", ...etapaPayload(primeira ? rowId(primeira) : null, etapas) };
    const { error } = await atualizarAt(payload);
    if (error) { toast.error(error.message); return; }
    otimista(payload);
    if (responsavel && !meusPart.some((p) => text(p["usuario_id"]) === responsavel)) {
      await supabase.from("atendimentos_participantes").insert({ atendimento_id: atId, usuario_id: responsavel });
      void qc.invalidateQueries({ queryKey: ["table", "atendimentos_participantes"] });
    }
    const nomeKb = text(pick(destino, ["nome", "descricao"]));
    await notaInterna(`🔀 Atendimento transferido de ${kanban ? text(pick(kanban, ["nome", "descricao"])) : "sem departamento"} para ${nomeKb}.`);
    void qc.invalidateQueries({ queryKey: ["table", "atendimentos"] });
    toast.success(`Enviado para ${nomeKb}.`);
  }

  return (
    <aside className="flex w-full flex-col overflow-y-auto border-l border-border bg-card md:w-80 lg:w-96">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-semibold text-foreground">Dados do contato</h2>
        <Button variant="ghost" size="icon" onClick={onFechar} aria-label="Fechar painel"><X className="h-4 w-4" /></Button>
      </div>
      <div className="space-y-5 p-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <Avatar className="h-20 w-20">
            {fotoPessoa(pessoa) && <AvatarImage src={fotoPessoa(pessoa)} alt={nome} />}
            <AvatarFallback className="text-xl">{iniciais(nome)}</AvatarFallback>
          </Avatar>
          <div className="flex items-center gap-1">
            <p className="font-semibold text-foreground">{nome}</p>
            {pessoa && (
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Editar nome do contato" title="Editar nome do contato"
                onClick={async () => {
                  const novo = await perguntar({ title: "Nome do contato", description: "O nome fica gravado no cadastro e passa a aparecer em todas as conversas.", defaultValue: nome, confirmText: "Salvar" });
                  if (!novo?.trim() || novo.trim() === nome) return;
                  const col = ["nome", "razao_social"].find((k) => k in pessoa) ?? "nome";
                  await salvarPessoa({ [col]: novo.trim(), ...("nome_editado" in pessoa ? { nome_editado: true } : {}) });
                  toast.success("Nome atualizado.");
                }}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{telefonePessoa(pessoa) || "Sem telefone"}</p>
          {pick(pessoa, ["email"]) && <p className="text-sm text-muted-foreground">{text(pessoa?.["email"])}</p>}
          {pessoa && <StarRating value={Number(pessoa[avCol] ?? 0)} onChange={(v) => salvarPessoa({ [avCol]: v })} />}
        </div>

        <Tabs defaultValue="atendimento">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="atendimento">Atendimento</TabsTrigger>
            <TabsTrigger value="campos">Dados & Campos</TabsTrigger>
          </TabsList>
          <TabsContent value="atendimento" className="space-y-5 pt-3">
        {pessoa && (
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase text-muted-foreground">Observações</p>
            <Textarea value={obs} rows={3} onChange={(e) => setObs(e.target.value)} onBlur={() => obs !== text(pessoa[obsCol]) && salvarPessoa({ [obsCol]: obs })} />
          </div>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase text-muted-foreground">Atendentes</p>
            <div className="flex">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm"><ArrowRightLeft className="mr-1 h-3.5 w-3.5" /> Transferir</Button>
              </PopoverTrigger>
              <PopoverContent className="max-h-80 w-64 overflow-y-auto p-1" align="end">
                <p className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase text-muted-foreground">Departamento</p>
                {kanbansDestino.filter((k) => text(rowId(k)) !== text(pick(atendimento, A.kanban)))
                  .sort((a, b) => text(pick(a, ["nome", "descricao"])).localeCompare(text(pick(b, ["nome", "descricao"])), "pt-BR")).map((k) => (
                  <button key={`kb-${text(rowId(k))}`} type="button" className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => void transferirKanban(text(rowId(k)))}>
                    {text(pick(k, ["nome", "descricao"]))}
                  </button>
                ))}
                <p className="mt-1 border-t border-border px-2 pb-1 pt-2 text-[11px] font-medium uppercase text-muted-foreground">Atendente</p>
                {usuarios.filter((u) => text(rowId(u)) !== responsavel && u["status"] !== false)
                  .sort((a, b) => nomeUsuario(a).localeCompare(nomeUsuario(b), "pt-BR")).map((u) => (
                  <button key={text(rowId(u))} type="button" className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => void transferirAtendente(text(rowId(u)))}>
                    {nomeUsuario(u)}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm"><Plus className="mr-1 h-3.5 w-3.5" /> Convidar</Button>
              </PopoverTrigger>
              <PopoverContent className="max-h-64 w-60 overflow-y-auto p-1" align="end">
                {usuarios.filter((u) => !partIds.has(text(rowId(u))) && u["status"] !== false).map((u) => (
                  <button key={text(rowId(u))} type="button" className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => convidar(text(rowId(u)))}>
                    {nomeUsuario(u)}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[...partIds].map((uid) => {
              const u = usuarios.find((x) => text(rowId(x)) === uid);
              const n = nomeUsuario(u);
              return (
                <span key={uid} className="group inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-0.5 pr-2 text-xs">
                  <Avatar className="h-6 w-6"><AvatarFallback className="text-[10px]">{iniciais(n)}</AvatarFallback></Avatar>
                  {n}{uid === responsavel && <span className="text-primary">(resp.)</span>}
                  {uid !== responsavel && (
                    <button type="button" aria-label="Remover" className="opacity-0 group-hover:opacity-100" onClick={() => removerPart(uid)}><X className="h-3 w-3" /></button>
                  )}
                </span>
              );
            })}
            {partIds.size === 0 && <p className="text-sm text-muted-foreground">Nenhum atendente ainda.</p>}
          </div>
        </section>

        <section className="space-y-2">
          <p className="flex items-center gap-1 text-xs font-medium uppercase text-muted-foreground"><Tag className="h-3 w-3" /> Etiquetas</p>
          <div className="flex flex-wrap gap-1.5">
            {etiquetasDoQuadro(etiquetas, text(pick(atendimento, A.kanban))).filter((e) => e["status"] !== false || minhasEt.has(text(rowId(e)))).map((e) => {
              const eid = text(rowId(e));
              const on = minhasEt.has(eid);
              const cor = corEtiqueta(e);
              return (
                <button
                  key={eid}
                  type="button"
                  onClick={() => toggleEtiqueta(eid)}
                  className="rounded-full border px-2 py-0.5 text-xs transition-opacity"
                  style={{ borderColor: cor, backgroundColor: on ? cor : "transparent", color: on ? "#fff" : cor, opacity: on ? 1 : 0.75 }}
                >
                  {text(pick(e, ["descricao", "nome"]))}
                </button>
              );
            })}
            {etiquetas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma etiqueta cadastrada.</p>}
          </div>
        </section>

        {pesquisa.dialog}
        {checklist.dialog}

        <ChecklistsPainel atId={atId} />
          </TabsContent>
          <TabsContent value="campos" className="space-y-4 pt-3">
            {pessoaId !== undefined ? (
              <PessoaCampos pessoaId={pessoaId} />
            ) : (
              <p className="text-sm text-muted-foreground">Contato não identificado.</p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </aside>
  );
}
