import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
  const [f, setF] = useState({ objetivo: OBJETIVO_LEVANTAMENTO, cliente: "", tecnico: "", data: todayISO(), hora: "09:00", comCusto: false, itemId: "" });

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
        tecnico_usuario_id: f.tecnico, status: f.comCusto ? "Aguardando aprovação da taxa" : "Pendente",
      }, colsLaudo) as never).select("id").single();
      if (error) throw error;
      const laudoId = String((laudo as Row)["id"]);
      const tipo = objetivoLabel(f.objetivo);
      const proprio = f.tecnico === (usuarioId ?? me);

      const t = await (supabase.from("tarefas_usuarios" as never) as unknown as ReturnType<typeof supabase.from>).insert({
        empresa_id: empresaId, criado_por: usuarioId ?? me, responsavel_id: f.tecnico,
        titulo: `${tipo}: ${nomeCliente}`, descricao: `Laudo ${numero} · ${f.data} ${f.hora}\nTelefone: ${telefone}${f.comCusto ? "\nVisita com custo: aguardar aprovação da Oferta." : ""}`,
        data_solicitacao: todayISO(), data_entrega: f.data, data_planejada: proprio ? f.data : null,
        status: proprio ? "andamento" : "aguardando", prioridade: "media", anexos: [],
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
      if (!proprio && onAvisar) await onAvisar(f.tecnico, `📋 Laudo ${numero} (${tipo}) para ${nomeCliente} em ${f.data} ${f.hora}. Aceite a tarefa no Planner.`).catch(() => undefined);
      for (const k of ["laudos_tecnicos", "orcamentos"]) void qc.invalidateQueries({ queryKey: ["table", k] });
      void qc.invalidateQueries({ queryKey: ["planner"] });
      void qc.invalidateQueries({ queryKey: ["tarefas-usuarios"] });
      toast.success(`Laudo ${numero} solicitado e agendado no Planner.${extra}`);
      setF({ ...f, cliente: "", comCusto: false, itemId: "" });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível solicitar o laudo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !salvando && onOpenChange(o)}>
      <DialogContent>
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
          <Button disabled={salvando} onClick={() => void solicitar()}>{salvando && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
