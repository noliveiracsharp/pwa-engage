import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Paperclip, X, FileText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { uploadAnexo, enviarWhatsappEmpresa } from "@/lib/manutencoes";
import { notificarEquipe } from "@/lib/avisos-equipe";
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
import { linhaOfertaDoItem } from "@/lib/comercial-chat";
import { NovoParceiroRapido } from "@/components/parceiros/NovoParceiroRapido";

const brl = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const nomeU = (u: Row) => String(pick(u, ["nome", "nome_completo", "email"]) ?? "Usuário");

/** Solicitar laudo técnico fora do atendimento (ex.: pelo Planner). Mesmo fluxo do painel Comercial do chat. */
export function SolicitarLaudoDialog({ open, onOpenChange, usuarios, me, onAvisar }: {
  open: boolean; onOpenChange: (o: boolean) => void; usuarios: Row[]; me: string;
  onAvisar?: (usuarioId: string, texto: string) => Promise<void>;
}) {
  const qc = useQueryClient();
  const { usuarioId, empresaId } = useAudit();
  const { data: itens = [] } = useTableRows("itens");
  const { data: parceiros = [] } = useTableRows("parceiros");
  const { data: colsLaudo } = useCols("laudos_tecnicos");
  const salvarOferta = useSaveOrcamento();
  const [salvando, setSalvando] = useState(false);
  const [anexos, setAnexos] = useState<{ url: string; nome: string; tipo: "imagem" | "arquivo" }[]>([]);
  const [enviando, setEnviando] = useState(false);
  async function anexar(files: FileList | null) {
    if (!files?.length) return;
    setEnviando(true);
    try {
      const novos: { url: string; nome: string; tipo: "imagem" | "arquivo" }[] = [];
      for (const file of Array.from(files)) novos.push({ url: await uploadAnexo(file), nome: file.name, tipo: (file.type.startsWith("image/") ? "imagem" : "arquivo") as "imagem" | "arquivo" });
      setAnexos((a) => [...a, ...novos]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao enviar o arquivo."); }
    finally { setEnviando(false); }
  }
  const [f, setF] = useState({ briefing: "", objetivo: OBJETIVO_LEVANTAMENTO, cliente: "", tecnico: "", data: todayISO(), hora: "09:00", comCusto: false, itemId: "" });

  const clienteOpts = useMemo(() => parceiros
    .filter((p) => p["is_cliente"] !== false && p["status"] !== false)
    .map((p) => ({ value: text(rowId(p)), label: String(pick(p, ["razao_social", "nome_fantasia"]) ?? "—") }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")), [parceiros]);
  const itemOpts = useMemo(() => itens.filter((i) => i["ativo"] !== false)
    .map((i) => ({ value: text(rowId(i)), label: `${String(i["descricao"] ?? "Item")} · ${brl(pick(i, ["preco_venda", "valor_venda", "preco"]))}`, keywords: [String(i["codigo"] ?? "")] }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")), [itens]);
  const tecOpts = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of usuarios) m.set(text(rowId(u)), nomeU(u));
    if (me && !m.has(me)) m.set(me, "Eu mesmo");
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [usuarios, me]);

  async function solicitar() {
    if (!f.cliente) return void toast.error("Selecione o cliente.");
    if (!f.tecnico) return void toast.error("Selecione o técnico responsável.");
    if (f.comCusto && !f.itemId) return void toast.error("Selecione no catálogo o item da taxa do laudo.");
    setSalvando(true);
    try {
      const cli = parceiros.find((p) => text(rowId(p)) === f.cliente);
      const nomeCliente = String(pick(cli, ["razao_social", "nome_fantasia"]) ?? "cliente");
      const telefone = String(pick(cli, ["telefone", "celular", "whatsapp"]) ?? "—");
      const numero = await proximoNumero("laudos_tecnicos", "LAU", empresaId);
      const { data: laudo, error } = await supabase.from("laudos_tecnicos").insert(filterPayload({
        numero, empresa_id: empresaId, parceiro_id: f.cliente, objetivo: f.objetivo, data_visita: f.data,
        tecnico_usuario_id: f.tecnico, observacoes_gerais: f.briefing.trim() || null, status: f.comCusto ? "Aguardando aprovação da taxa" : "Pendente",
      }, colsLaudo) as never).select("id").single();
      if (error) throw error;
      const laudoId = String((laudo as Row)["id"]);
      const fotos = anexos.filter((a) => a.tipo === "imagem").map((a) => ({ laudo_id: laudoId, laudo_item_id: null, url_foto: a.url }));
      if (fotos.length) await supabase.from("laudos_fotos").insert(fotos as never);
      const tipo = objetivoLabel(f.objetivo);
      const proprio = f.tecnico === (usuarioId ?? me);

      const t = await (supabase.from("tarefas_usuarios" as never) as unknown as ReturnType<typeof supabase.from>).insert({
        empresa_id: empresaId, criado_por: usuarioId ?? me, responsavel_id: f.tecnico,
        titulo: `${tipo}: ${nomeCliente}`, descricao: `Laudo ${numero} · ${f.data} ${f.hora}\nTelefone: ${telefone}${f.briefing.trim() ? `\n\nBriefing:\n${f.briefing.trim()}` : ""}${f.comCusto ? "\nVisita com custo: aguardar aprovação da Oferta." : ""}`,
        data_solicitacao: todayISO(), data_entrega: f.data, data_planejada: proprio ? f.data : null,
        status: proprio ? "andamento" : "aguardando", prioridade: "media", anexos,
      } as never);
      if (t.error) throw t.error;

      let extra = "";
      if (f.comCusto) {
        const item = itens.find((i) => text(rowId(i)) === f.itemId)!;
        const res = await salvarOferta.mutateAsync({
          original: null, linhas: [linhaOfertaDoItem(item)],
          header: {
            empresa_id: empresaId, parceiro_id: f.cliente, usuario_id: usuarioId ?? null, dt_orcamento: todayISO(),
            situacao: "Em andamento", laudo_id: laudoId, origem_lead: "Planner",
            descricao: `Taxa de ${tipo.toLowerCase()} · Laudo ${numero}`,
          },
        });
        extra = ` Oferta ${res.numero} da taxa criada.`;
      }
      const dataBR = f.data.split("-").reverse().join("/");
      const endereco = [pick(cli, ["endereco", "logradouro"]), pick(cli, ["numero"]), pick(cli, ["bairro"]), pick(cli, ["cidade"])].filter(Boolean).join(", ");
      if (!proprio && onAvisar) await onAvisar(f.tecnico, `📋 Laudo ${numero} (${tipo}) para ${nomeCliente} em ${dataBR} ${f.hora}. Aceite a tarefa no Planner.`).catch(() => undefined);
      // Técnico: sininho + push + WhatsApp com os dados da visita.
      const r = await notificarEquipe({
        empresaId, autorId: usuarioId ?? me, usuarioIds: [f.tecnico], link: "/planner",
        titulo: `Laudo agendado: ${tipo}`,
        texto: [`📋 Laudo ${numero} · ${nomeCliente}`, `📅 ${dataBR} às ${f.hora}`, endereco ? `📍 ${endereco}` : "", `📞 ${telefone}`,
          f.briefing.trim() ? `\n📝 Briefing:\n${f.briefing.trim()}` : "", anexos.length ? `\n📎 Anexos:\n${anexos.map((a) => `${a.nome}: ${a.url}`).join("\n")}` : ""].filter(Boolean).join("\n"),
      }).catch(() => ({ avisos: 0, whatsapp: 0 }));
      // Cliente: confirmação do agendamento por WhatsApp.
      let zapCli = false;
      const foneCli = String(pick(cli, ["whatsapp", "celular", "telefone"]) ?? "");
      if (foneCli.replace(/\D/g, "").length >= 10) {
        const tecNome = tecOpts.find((o) => o.value === f.tecnico)?.label ?? "";
        zapCli = !(await enviarWhatsappEmpresa(empresaId, foneCli, `Olá, ${nomeCliente}!\n\nSua visita de *${tipo.toLowerCase()}* (${numero}) foi agendada para *${dataBR} às ${f.hora}*${tecNome && tecNome !== "Eu mesmo" ? ` com o técnico *${tecNome}*` : ""}.\n\nQualquer dúvida, é só responder esta mensagem.`).catch(() => "erro"));
      }
      extra += r.whatsapp ? " Técnico avisado no WhatsApp." : "";
      extra += zapCli ? " Cliente avisado no WhatsApp." : "";
      for (const k of ["laudos_tecnicos", "orcamentos"]) void qc.invalidateQueries({ queryKey: ["table", k] });
      void qc.invalidateQueries({ queryKey: ["planner"] });
      void qc.invalidateQueries({ queryKey: ["tarefas-usuarios"] });
      toast.success(`Laudo ${numero} solicitado e agendado no Planner.${extra}`);
      setF({ ...f, cliente: "", comCusto: false, itemId: "", briefing: "" });
      setAnexos([]);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível solicitar o laudo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !salvando && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Solicitar laudo técnico</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {OBJETIVOS.map((o) => (
              <Button key={o.value} type="button" variant={f.objetivo === o.value ? "default" : "outline"} onClick={() => setF({ ...f, objetivo: o.value })}>{o.label}</Button>
            ))}
          </div>
          <div className="space-y-1">
            <Label>Cliente</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1"><SearchSelect value={f.cliente} onChange={(v) => setF({ ...f, cliente: v })} options={clienteOpts} placeholder="Buscar cliente" /></div>
              <NovoParceiroRapido tipo="cliente" onCriado={(id) => { setF((x) => ({ ...x, cliente: id })); void qc.invalidateQueries({ queryKey: ["table", "parceiros"] }); }} />
            </div>
          </div>
          <div className="space-y-1"><Label>Técnico responsável</Label><SearchSelect value={f.tecnico} onChange={(v) => setF({ ...f, tecnico: v })} options={tecOpts} placeholder="Selecione o técnico" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>Data da visita</Label><Input type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></div>
            <div className="space-y-1"><Label>Horário</Label><Input type="time" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} /></div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="laudo-briefing">Briefing</Label>
            <Textarea id="laudo-briefing" rows={4} placeholder="O que o técnico precisa saber: problema relatado, acesso ao local, contato no dia…" value={f.briefing} onChange={(e) => setF({ ...f, briefing: e.target.value })} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Arquivos e fotos</Label>
              <Button type="button" size="sm" variant="outline" disabled={enviando} asChild>
                <label className="cursor-pointer">
                  {enviando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Paperclip className="mr-1 h-4 w-4" />} Anexar
                  <input type="file" multiple className="sr-only" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={(e) => { void anexar(e.target.files); e.target.value = ""; }} />
                </label>
              </Button>
            </div>
            {anexos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {anexos.map((a, i) => (
                  <div key={a.url} className="relative">
                    {a.tipo === "imagem"
                      ? <img src={a.url} alt={a.nome} className="h-16 w-16 rounded-md border border-border object-cover" />
                      : <div className="flex h-16 w-28 items-center gap-1 rounded-md border border-border p-2 text-xs"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">{a.nome}</span></div>}
                    <button type="button" aria-label={`Remover ${a.nome}`} className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground" onClick={() => setAnexos((x) => x.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div><p className="text-sm font-medium">Visita com custo</p><p className="text-xs text-muted-foreground">Gera uma Oferta com o item do catálogo para o cliente aprovar.</p></div>
            <Switch checked={f.comCusto} onCheckedChange={(v) => setF({ ...f, comCusto: v })} />
          </div>
          {f.comCusto && (
            <div className="space-y-1"><Label>Item da taxa (catálogo)</Label><SearchSelect value={f.itemId} onChange={(v) => setF({ ...f, itemId: v })} options={itemOpts} placeholder="Ex.: Taxa de vistoria" /></div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={salvando} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={salvando || enviando} onClick={() => void solicitar()}>{salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
