import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardCheck, FileText, Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { rowId, text, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { useAudit } from "@/lib/audit";
import { filterPayload, useCols } from "@/lib/projetos";
import { OBJETIVOS, OBJETIVO_LEVANTAMENTO, objetivoLabel, proximoNumero } from "@/lib/laudos";
import { useSaveOrcamento } from "@/hooks/useSaveOrcamento";
import { todayISO } from "@/lib/orcamentos";
import { linkProposta } from "@/lib/propostas";
import { dispararMensagem, marcarEnvio } from "@/lib/atendimentos-envio";
import { A, telefonePessoa } from "@/lib/atendimentos";
import { linhaOfertaDoItem, mensagemOfertaChat } from "@/lib/comercial-chat";
import { NovoParceiroRapido } from "@/components/parceiros/NovoParceiroRapido";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { Textarea } from "@/components/ui/textarea";

type Props = { atendimento: Row; pessoa: Row | undefined; instancia: Row | undefined; usuarios: Row[]; orcamentos: Row[] };

const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const nomeU = (u: Row) => String(pick(u, ["nome", "nome_completo", "email"]) ?? "Usuário");

export function ComercialChat({ atendimento, pessoa, instancia, usuarios, orcamentos }: Props) {
  const qc = useQueryClient();
  const { usuarioId, empresaId } = useAudit();
  const { data: itens = [] } = useTableRows("itens");
  const { data: laudos = [] } = useTableRows("laudos_tecnicos");
  const { data: colsLaudo } = useCols("laudos_tecnicos");
  const { data: colsMsg } = useCols("atendimentos_mensagem");
  const salvarOferta = useSaveOrcamento();
  // Quem não pode criar Ofertas (ex.: Suporte) encaminha uma solicitação ao Comercial.
  const permOferta = usePagePermissions("/orcamentos");
  const podeCriarOferta = permOferta.canCreate;
  const [solAberta, setSolAberta] = useState(false);
  const [sol, setSol] = useState({ vendedor: "", texto: "", urgente: false });
  const atId = text(rowId(atendimento));
  const [parceiroLocal, setParceiroLocal] = useState("");
  const parceiroId = parceiroLocal || text(pessoa?.["parceiro_id"]);
  const nomeCliente = String(pick(pessoa, ["nome", "nome_completo"]) ?? "cliente");
  const { data: parceiros = [] } = useTableRows("parceiros");
  const clienteOpts = useMemo(() => parceiros
    .filter((p) => p["is_cliente"] !== false && p["status"] !== false)
    .map((p) => ({ value: text(rowId(p)), label: String(pick(p, ["razao_social", "nome_fantasia"]) ?? "—") }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")), [parceiros]);

  async function vincularCliente(id: string) {
    if (!id || !pessoa) return;
    const { error } = await supabase.from("pessoas").update({ parceiro_id: id } as never).eq("id", String(rowId(pessoa)));
    if (error) return void toast.error(error.message);
    setParceiroLocal(id);
    void qc.invalidateQueries({ queryKey: ["table", "pessoas"] });
    toast.success("Contato vinculado ao cliente.");
  }

  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [f, setF] = useState({ objetivo: OBJETIVO_LEVANTAMENTO, tecnico: "", data: todayISO(), hora: "09:00", comCusto: false, itemId: "" });

  const ofertas = orcamentos.filter((o) => text(o["atendimento_id"]) === atId);
  const meusLaudos = laudos.filter((l) => text(l["atendimento_id"]) === atId);
  const itemOpts = useMemo(
    () => itens.filter((i) => i["ativo"] !== false)
      .map((i) => ({ value: text(rowId(i)), label: `${String(i["descricao"] ?? "Item")} · ${brl(pick(i, ["preco_venda", "valor_venda", "preco"]))}`, keywords: [String(i["codigo"] ?? "")] }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
    [itens],
  );
  const tecOpts = useMemo(() => usuarios.map((u) => ({ value: text(rowId(u)), label: nomeU(u) })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR")), [usuarios]);

  async function notaInterna(msg: string) {
    await supabase.from("atendimentos_mensagem").insert(filterPayload({ atendimento_id: atId, mensagem: msg, conteudo: msg, texto: msg, tipo: "texto", msg_interna: true, usuario_id: usuarioId, empresa_id: empresaId }, colsMsg) as never);
    void qc.invalidateQueries({ queryKey: ["table", "atendimentos_mensagem", "at", atId] });
  }

  async function enviarCliente(conteudo: string) {
    const payload = { atendimento_id: atId, mensagem: conteudo, conteudo, texto: conteudo, tipo: "texto", msg_interna: false, usuario_id: usuarioId, empresa_id: empresaId, instancia_id: pick(atendimento, A.instancia), status_envio: "pendente" };
    const { data, error } = await supabase.from("atendimentos_mensagem").insert(filterPayload(payload, colsMsg) as never).select().single();
    if (error) return void toast.error(error.message);
    const mid = (data as Row | null)?.["id"];
    try {
      const zid = await dispararMensagem({ instancia, mensagemId: mid, atendimentoId: atId, telefone: telefonePessoa(pessoa), texto: conteudo });
      await marcarEnvio(mid, "enviado", zid);
      toast.success("Mensagem enviada ao cliente.");
    } catch (e) {
      await marcarEnvio(mid, "falha");
      toast.error(`Mensagem salva, mas o envio falhou: ${(e as Error).message}`);
    }
    void qc.invalidateQueries({ queryKey: ["table", "atendimentos_mensagem", "at", atId] });
  }

  async function enviarOferta(o: Row) {
    const { data } = await supabase.from("orcamentos").select("*").eq("id", String(rowId(o))).single();
    const of = (data ?? o) as Row;
    const link = of["token_publico"] ? linkProposta(of["token_publico"]) : "";
    await enviarCliente(mensagemOfertaChat({ nome: nomeCliente, numero: text(of["numero"]), total: Number(of["total_liquido"] ?? 0), link }));
    await supabase.from("orcamentos").update({ enviada_em: new Date().toISOString(), enviada_via: "whatsapp" } as never).eq("id", String(rowId(of)));
  }

  const [ofAberta, setOfAberta] = useState(false);
  const [of, setOf] = useState<{ descricao: string; itens: { itemId: string; qtd: number }[] }>({ descricao: "", itens: [] });
  const totalOf = of.itens.reduce((s, l) => {
    const it = itens.find((i) => text(rowId(i)) === l.itemId);
    return s + (it ? linhaOfertaDoItem(it).valor_unitario * l.qtd : 0);
  }, 0);

  async function criarOferta() {
    if (!parceiroId) return void toast.error("Vincule este contato a um cliente antes de criar a Oferta.");
    if (!of.itens.length) return void toast.error("Adicione ao menos um item do catálogo.");
    setSalvando(true);
    try {
      const linhas = of.itens.map((l, idx) => {
        const base = linhaOfertaDoItem(itens.find((i) => text(rowId(i)) === l.itemId)!);
        const q = Math.max(1, l.qtd);
        const total = base.valor_unitario * q;
        const custo = base.preco_custo * q;
        return { ...base, ordem: idx + 1, quantidade: q, total_linha: total, custo_total: custo, lucro: total - custo };
      });
      const res = await salvarOferta.mutateAsync({
        original: null, linhas,
        header: {
          empresa_id: empresaId, parceiro_id: parceiroId, usuario_id: usuarioId ?? null, dt_orcamento: todayISO(),
          situacao: "Em andamento", atendimento_id: atId, origem_lead: "Atendimento", descricao: of.descricao.trim() || null,
        },
      });
      await notaInterna(`🧾 Oferta ${res.numero} criada pelo atendimento — use "Enviar" no painel Comercial.`);
      void qc.invalidateQueries({ queryKey: ["table", "orcamentos"] });
      setOfAberta(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar a Oferta.");
    } finally {
      setSalvando(false);
    }
  }

  async function solicitarOferta() {
    if (!sol.vendedor) return void toast.error("Escolha quem do Comercial vai preparar a Oferta.");
    if (!sol.texto.trim()) return void toast.error("Descreva o que o cliente precisa.");
    setSalvando(true);
    try {
      const vend = usuarios.find((u) => text(rowId(u)) === sol.vendedor);
      const tel = telefonePessoa(pessoa) ?? "—";
      const { error } = await (supabase.from("tarefas_usuarios" as never) as unknown as ReturnType<typeof supabase.from>).insert({
        empresa_id: empresaId, criado_por: usuarioId, responsavel_id: sol.vendedor,
        titulo: `Preparar Oferta: ${nomeCliente}`,
        descricao: `Solicitado pelo atendimento #${text(pick(atendimento, ["protocolo", "numero"]) ?? atId)}\nTelefone: ${tel}\n\nO que o cliente precisa:\n${sol.texto.trim()}`,
        data_solicitacao: todayISO(), data_entrega: todayISO(), status: "aguardando",
        prioridade: sol.urgente ? "alta" : "media", anexos: [],
      } as never);
      if (error) throw error;
      await notaInterna(`🔔 Oferta solicitada ao Comercial (${vend ? nomeU(vend) : "vendedor"}${sol.urgente ? ", urgente" : ""}): ${sol.texto.trim()}`);
      void qc.invalidateQueries({ queryKey: ["planner"] });
      toast.success("Solicitação enviada ao Comercial.");
      setSolAberta(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar a solicitação.");
    } finally {
      setSalvando(false);
    }
  }

  async function solicitar() {
    if (!parceiroId) return void toast.error("Vincule este contato a um cliente (Clientes e Fornecedores) antes de solicitar o laudo.");
    if (!f.tecnico) return void toast.error("Selecione o técnico responsável.");
    if (f.comCusto && !f.itemId) return void toast.error("Selecione no catálogo o item da taxa do laudo.");
    setSalvando(true);
    try {
      const numero = await proximoNumero("laudos_tecnicos", "LAU", empresaId);
      const { data: laudo, error } = await supabase.from("laudos_tecnicos").insert(filterPayload({
        numero, empresa_id: empresaId, parceiro_id: parceiroId, objetivo: f.objetivo, data_visita: f.data,
        tecnico_usuario_id: f.tecnico, atendimento_id: atId, status: f.comCusto ? "Aguardando aprovação da taxa" : "Pendente",
      }, colsLaudo) as never).select("id").single();
      if (error) throw error;
      const laudoId = String((laudo as Row)["id"]);
      const tipo = objetivoLabel(f.objetivo);
      const tec = usuarios.find((u) => text(rowId(u)) === f.tecnico);

      // Agenda do técnico no Planner (aceite quando delegado a outra pessoa).
      await (supabase.from("tarefas_usuarios" as never) as unknown as ReturnType<typeof supabase.from>).insert({
        empresa_id: empresaId, criado_por: usuarioId, responsavel_id: f.tecnico,
        titulo: `${tipo}: ${nomeCliente}`, descricao: `Laudo ${numero} · ${f.data} ${f.hora}\nTelefone: ${telefonePessoa(pessoa) ?? "—"}${f.comCusto ? "\nVisita com custo: aguardar aprovação da Oferta." : ""}`,
        data_solicitacao: todayISO(), data_entrega: f.data, data_planejada: f.tecnico === usuarioId ? f.data : null,
        status: f.tecnico === usuarioId ? "andamento" : "aguardando", prioridade: "media", anexos: [],
      } as never);

      if (f.comCusto) {
        const item = itens.find((i) => text(rowId(i)) === f.itemId)!;
        const res = await salvarOferta.mutateAsync({
          original: null, linhas: [linhaOfertaDoItem(item)],
          header: {
            empresa_id: empresaId, parceiro_id: parceiroId, usuario_id: usuarioId ?? null, dt_orcamento: todayISO(),
            situacao: "Em andamento", laudo_id: laudoId, atendimento_id: atId, origem_lead: "Atendimento",
            descricao: `Taxa de ${tipo.toLowerCase()} · Laudo ${numero}`,
          },
        });
        await notaInterna(`📋 Laudo ${numero} solicitado a ${tec ? nomeU(tec) : "técnico"} para ${f.data}. Oferta ${res.numero} da taxa criada — use "Enviar" no painel Comercial.`);
      } else {
        await notaInterna(`📋 Laudo ${numero} (${tipo}, sem custo) solicitado a ${tec ? nomeU(tec) : "técnico"} para ${f.data} ${f.hora}.`);
      }
      for (const t of ["laudos_tecnicos", "orcamentos"]) void qc.invalidateQueries({ queryKey: ["table", t] });
      void qc.invalidateQueries({ queryKey: ["planner"] });
      toast.success(`Laudo ${numero} solicitado e agendado no Planner.`);
      setAberto(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível solicitar o laudo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase text-muted-foreground">Comercial</h3>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setAberto(true)}><ClipboardCheck className="mr-1 h-4 w-4" /> Solicitar laudo</Button>
        {podeCriarOferta
          ? <Button size="sm" variant="outline" onClick={() => { setOf({ descricao: "", itens: [] }); setOfAberta(true); }}><FileText className="mr-1 h-4 w-4" /> Criar oferta</Button>
          : <Button size="sm" variant="outline" onClick={() => { setSol({ vendedor: "", texto: "", urgente: false }); setSolAberta(true); }}><FileText className="mr-1 h-4 w-4" /> Solicitar oferta</Button>}
      </div>
      {meusLaudos.map((l) => (
        <p key={text(rowId(l))} className="text-sm text-muted-foreground">Laudo {text(l["numero"])} · {text(l["status"])}</p>
      ))}
      {ofertas.map((o) => (
        <div key={text(rowId(o))} className="flex items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
          <span className="flex items-center gap-1"><FileText className="h-4 w-4 text-muted-foreground" /> Oferta {text(o["numero"])} · {brl(o["total_liquido"])}</span>
          <Button size="sm" variant="ghost" onClick={() => void enviarOferta(o)}><Send className="mr-1 h-3 w-3" /> Enviar</Button>
        </div>
      ))}

      <Dialog open={aberto} onOpenChange={(o) => !salvando && setAberto(o)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Solicitar laudo técnico</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {OBJETIVOS.map((o) => (
                <Button key={o.value} type="button" variant={f.objetivo === o.value ? "default" : "outline"} onClick={() => setF({ ...f, objetivo: o.value })}>{o.label}</Button>
              ))}
            </div>
            <div className="space-y-1"><Label>Técnico responsável</Label><SearchSelect value={f.tecnico} onChange={(v) => setF({ ...f, tecnico: v })} options={tecOpts} placeholder="Selecione o técnico" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label>Data da visita</Label><Input type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></div>
              <div className="space-y-1"><Label>Horário</Label><Input type="time" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} /></div>
            </div>
            {podeCriarOferta ? <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div><p className="text-sm font-medium">Visita com custo</p><p className="text-xs text-muted-foreground">Gera uma Oferta com o item do catálogo para o cliente aprovar.</p></div>
              <Switch checked={f.comCusto} onCheckedChange={(v) => setF({ ...f, comCusto: v })} />
            </div> : <p className="text-xs text-muted-foreground">Se a visita tiver custo, o Comercial prepara a cobrança depois.</p>}
            {f.comCusto && (
              <div className="space-y-1"><Label>Item da taxa (catálogo)</Label><SearchSelect value={f.itemId} onChange={(v) => setF({ ...f, itemId: v })} options={itemOpts} placeholder="Ex.: Taxa de vistoria" /></div>
            )}
            {!parceiroId && (
              <div className="space-y-2 rounded-md border border-destructive/40 p-3">
                <p className="text-xs text-destructive">Este contato ainda não está ligado a um cliente. Selecione um existente ou cadastre.</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1"><SearchSelect value="" onChange={(v) => void vincularCliente(v)} options={clienteOpts} placeholder="Buscar cliente" /></div>
                  <NovoParceiroRapido tipo="cliente" onCriado={(id) => void vincularCliente(id)} inicial={{ razao_social: nomeCliente, telefone: telefonePessoa(pessoa) }} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={salvando} onClick={() => setAberto(false)}>Cancelar</Button>
            <Button disabled={salvando} onClick={() => void solicitar()}>{salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={solAberta} onOpenChange={(o) => !salvando && setSolAberta(o)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Solicitar Oferta ao Comercial</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Conte o que {nomeCliente} precisa. O Comercial recebe uma tarefa no Planner, monta os valores e envia a Oferta.</p>
            <div className="space-y-1"><Label>Quem do Comercial vai atender</Label><SearchSelect value={sol.vendedor} onChange={(v) => setSol({ ...sol, vendedor: v })} options={tecOpts} placeholder="Selecione o vendedor" /></div>
            <div className="space-y-1"><Label htmlFor="sol-texto">O que o cliente precisa</Label><Textarea id="sol-texto" rows={5} value={sol.texto} onChange={(e) => setSol({ ...sol, texto: e.target.value })} placeholder="Ex.: trocar switch da portaria e incluir mais 2 câmeras na garagem" /></div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div><p className="text-sm font-medium">Urgente</p><p className="text-xs text-muted-foreground">A tarefa chega com prioridade alta.</p></div>
              <Switch checked={sol.urgente} onCheckedChange={(v) => setSol({ ...sol, urgente: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={salvando} onClick={() => setSolAberta(false)}>Cancelar</Button>
            <Button disabled={salvando} onClick={() => void solicitarOferta()}>{salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Enviar ao Comercial</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={ofAberta} onOpenChange={(o) => !salvando && setOfAberta(o)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Criar Oferta para {nomeCliente}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!parceiroId && (
              <div className="space-y-2 rounded-md border border-destructive/40 p-3">
                <p className="text-xs text-destructive">Este contato ainda não está ligado a um cliente. Selecione um existente ou cadastre.</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1"><SearchSelect value="" onChange={(v) => void vincularCliente(v)} options={clienteOpts} placeholder="Buscar cliente" /></div>
                  <NovoParceiroRapido tipo="cliente" onCriado={(id) => void vincularCliente(id)} inicial={{ razao_social: nomeCliente, telefone: telefonePessoa(pessoa) }} />
                </div>
              </div>
            )}
            <div className="space-y-1"><Label>Descrição</Label><Input value={of.descricao} onChange={(e) => setOf({ ...of, descricao: e.target.value })} placeholder="Ex.: Instalação de câmeras" /></div>
            <div className="space-y-1">
              <Label>Adicionar item do catálogo</Label>
              <SearchSelect value="" onChange={(v) => v && setOf({ ...of, itens: [...of.itens, { itemId: v, qtd: 1 }] })} options={itemOpts} placeholder="Buscar produto ou serviço" />
            </div>
            {of.itens.map((l, idx) => {
              const it = itens.find((i) => text(rowId(i)) === l.itemId);
              return (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{String(it?.["descricao"] ?? "Item")}</span>
                  <Input type="number" min={1} className="w-20" value={l.qtd} onChange={(e) => setOf({ ...of, itens: of.itens.map((x, j) => (j === idx ? { ...x, qtd: Number(e.target.value) || 1 } : x)) })} />
                  <Button size="sm" variant="ghost" onClick={() => setOf({ ...of, itens: of.itens.filter((_, j) => j !== idx) })}>Remover</Button>
                </div>
              );
            })}
            <p className="text-right text-sm font-semibold">Total: {brl(totalOf)}</p>
            <p className="text-xs text-muted-foreground">Descontos, parcelas e contrato podem ser ajustados depois na tela de Ofertas.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={salvando} onClick={() => setOfAberta(false)}>Cancelar</Button>
            <Button disabled={salvando} onClick={() => void criarOferta()}>{salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
