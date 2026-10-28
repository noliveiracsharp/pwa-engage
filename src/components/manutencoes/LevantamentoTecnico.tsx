import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Clock, Plus, Send, ShoppingCart, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { perguntar } from "@/components/layout/DialogoGlobal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSecoes } from "@/hooks/useSecoes";
import { rowId, text, useTableRows } from "@/lib/crud";
import { pick, type Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { proximoNumero } from "@/lib/laudos";
import {
  SLA_DIAS_UTEIS, STATUS_LEVANTAMENTO, podeDecidir, podeEnviar, podeGerarCotacao, situacaoPrazo, statusLevantamento,
  type EventoLevantamento, type ItemLevantamento,
} from "@/lib/levantamento";

const PRAZO_CLS = { ok: "text-success", vencendo: "text-warning", atrasado: "text-destructive" } as const;

export function LevantamentoTecnico({ os, cliente }: { os: Row; cliente: string }) {
  const qc = useQueryClient();
  const { usuario } = useAuth();
  const { data: itensCat = [] } = useTableRows("itens");
  const secoes = useSecoes("/manutencoes", [{ key: "aprovar-levantamento", label: "Aprovar levantamento técnico" }]);
  const souGestor = !!secoes["aprovar-levantamento"]?.canUpdate;
  const nomeUsuario = text(pick(usuario ?? {}, ["nome", "nome_completo"])) || "Usuário";

  const [status, setStatus] = useState(statusLevantamento(os["levantamento_status"]));
  const [itens, setItens] = useState<ItemLevantamento[]>(Array.isArray(os["levantamento"]) ? (os["levantamento"] as ItemLevantamento[]) : []);
  const [hist, setHist] = useState<EventoLevantamento[]>(Array.isArray(os["levantamento_historico"]) ? (os["levantamento_historico"] as EventoLevantamento[]) : []);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    setStatus(statusLevantamento(os["levantamento_status"]));
    setItens(Array.isArray(os["levantamento"]) ? (os["levantamento"] as ItemLevantamento[]) : []);
    setHist(Array.isArray(os["levantamento_historico"]) ? (os["levantamento_historico"] as EventoLevantamento[]) : []);
  }, [os]);

  const opcoes = useMemo(() => itensCat
    .map((i) => ({ value: text(rowId(i)), label: text(pick(i, ["descricao", "nome"])) }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")), [itensCat]);
  const editavel = status === "rascunho" || status === "reprovado";
  const ultimo = hist[hist.length - 1];
  const ultimaDevolucao = [...hist].reverse().find((h) => h.acao === "reprovado");

  async function gravar(patch: Row, evento?: Omit<EventoLevantamento, "em" | "usuario">) {
    setOcupado(true);
    try {
      const novoHist = evento ? [...hist, { ...evento, em: new Date().toISOString(), usuario: nomeUsuario }] : hist;
      const { error } = await supabase.from("manutencao_os").update({ levantamento: itens, levantamento_historico: novoHist, ...patch } as never).eq("id", text(rowId(os)));
      if (error) throw error;
      setHist(novoHist);
      if (patch["levantamento_status"]) setStatus(statusLevantamento(patch["levantamento_status"]));
      void qc.invalidateQueries({ queryKey: ["table", "manutencao_os"] });
      return true;
    } catch (e) {
      toast.error(e instanceof Error && /column|levantamento/i.test(e.message) ? "Rode o script atendeai-fluxo-compras.sql para ativar o levantamento técnico." : e instanceof Error ? e.message : "Falha ao salvar.");
      return false;
    } finally { setOcupado(false); }
  }

  const enviar = async () => {
    const erro = podeEnviar(status, itens);
    if (erro) { toast.error(erro); return; }
    if (await gravar({ levantamento_status: "aguardando_aprovacao", levantamento_enviado_em: new Date().toISOString() }, { acao: "enviado" }))
      toast.success("Levantamento enviado para aprovação do gestor.");
  };
  const decidir = async (d: "aprovado" | "reprovado") => {
    let obs = "";
    if (d === "reprovado") obs = (await perguntar({ title: "Devolver ao técnico", description: "Observação do gestor (obrigatória).", required: true, multiline: true })) ?? "";
    else obs = (await perguntar({ title: "Aprovar levantamento", description: "Observação (opcional).", multiline: true })) ?? "";
    const erro = podeDecidir(status, d, obs);
    if (erro) { if (!(d === "reprovado" && !obs.trim())) toast.error(erro); return; }
    if (await gravar({ levantamento_status: d, levantamento_decidido_em: new Date().toISOString() }, { acao: d, obs: obs.trim() || null }))
      toast.success(d === "aprovado" ? "Levantamento aprovado. Cotação liberada." : "Levantamento devolvido ao técnico.");
  };
  const gerarCotacao = async () => {
    if (!podeGerarCotacao(status)) return;
    setOcupado(true);
    try {
      const numero = await proximoNumero("cotacoes", "COT", os["empresa_id"] as string);
      const { data, error } = await supabase.from("cotacoes").insert({
        empresa_id: os["empresa_id"], numero, manutencao_os_id: rowId(os), status: "pendente",
        titulo: `${text(os["numero"])} · ${cliente}`,
      } as never).select("id").single();
      if (error) throw error;
      const cid = (data as Row)["id"];
      const { error: e2 } = await supabase.from("cotacoes_itens").insert(
        itens.filter((i) => i.item_id).map((i) => ({ cotacao_id: cid, item_id: i.item_id, quantidade: i.quantidade, observacao: i.observacao ?? null, ...(i.grupo?.trim() ? { grupo: i.grupo.trim() } : {}) })) as never,
      );
      if (e2) throw e2;
      setOcupado(false);
      await gravar({ levantamento_status: "cotacao_gerada", cotacao_id: cid }, { acao: "cotacao", obs: `Cotação ${numero}` });
      for (const t of ["cotacoes", "cotacoes_itens"]) void qc.invalidateQueries({ queryKey: ["table", t] });
      toast.success(`Cotação ${numero} criada e enviada para Compras.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar a cotação.");
    } finally { setOcupado(false); }
  };

  const meta = STATUS_LEVANTAMENTO[status];
  const prazo = status === "aguardando_aprovacao" && os["levantamento_enviado_em"]
    ? situacaoPrazo(new Date(String(os["levantamento_enviado_em"])), SLA_DIAS_UTEIS.aprovacao) : null;
  const set = (i: number, p: Partial<ItemLevantamento>) => setItens((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Levantamento técnico (peças e serviços)</h3>
        <div className="flex items-center gap-2">
          {prazo && <span className={cn("flex items-center gap-1 text-xs", PRAZO_CLS[prazo])}><Clock className="h-3.5 w-3.5" />{prazo === "atrasado" ? "Aprovação atrasada" : prazo === "vencendo" ? "Vence hoje" : "No prazo (1 dia útil)"}</span>}
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", meta.cls)}>{meta.label}</span>
        </div>
      </div>

      {status === "reprovado" && ultimaDevolucao?.obs && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm"><b>Observação do gestor ({ultimaDevolucao.usuario}):</b> {ultimaDevolucao.obs}</p>
      )}

      <div className="space-y-2">
        {itens.map((it, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_90px_150px_1fr_auto]">
            <SearchSelect value={it.item_id} disabled={!editavel} onChange={(v) => set(i, { item_id: v })} options={opcoes} placeholder="Item do cadastro" />
            <Input type="number" min={0} step="any" disabled={!editavel} value={it.quantidade} onChange={(e) => set(i, { quantidade: Number(e.target.value) || 0 })} aria-label="Quantidade" />
            <Input disabled={!editavel} list="levantamento-grupos" placeholder="Grupo (ex.: Elétrico)" value={it.grupo ?? ""} onChange={(e) => set(i, { grupo: e.target.value })} aria-label="Grupo" />
            <Input disabled={!editavel} placeholder="Especificação / observação" value={it.observacao ?? ""} onChange={(e) => set(i, { observacao: e.target.value })} />
            {editavel && <Button type="button" size="icon" variant="ghost" aria-label="Remover" onClick={() => setItens((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}
          </div>
        ))}
        <datalist id="levantamento-grupos">{[...new Set(itens.map((x) => x.grupo?.trim()).filter(Boolean))].map((g) => <option key={g!} value={g!} />)}</datalist>
        {!itens.length && <p className="text-sm text-muted-foreground">Nenhum item levantado.</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {editavel && <>
          <Button type="button" size="sm" variant="outline" onClick={() => setItens((l) => [...l, { item_id: "", quantidade: 1 }])}><Plus className="mr-1 h-4 w-4" />Item</Button>
          <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => void gravar({}).then((ok) => ok && toast.success("Levantamento salvo."))}>Salvar rascunho</Button>
          <Button type="button" size="sm" disabled={ocupado} onClick={() => void enviar()}><Send className="mr-1 h-4 w-4" />Enviar para aprovação</Button>
        </>}
        {status === "aguardando_aprovacao" && souGestor && <>
          <Button type="button" size="sm" disabled={ocupado} onClick={() => void decidir("aprovado")}><CheckCircle2 className="mr-1 h-4 w-4" />Aprovar</Button>
          <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => void decidir("reprovado")}><XCircle className="mr-1 h-4 w-4" />Devolver com observação</Button>
        </>}
        {status === "aguardando_aprovacao" && !souGestor && <p className="text-sm text-muted-foreground">Aguardando o gestor aprovar.</p>}
        {podeGerarCotacao(status) && <Button type="button" size="sm" disabled={ocupado} onClick={() => void gerarCotacao()}><ShoppingCart className="mr-1 h-4 w-4" />Gerar cotação para Compras</Button>}
      </div>

      {hist.length > 0 && (
        <ol className="space-y-1 border-l pl-3 text-xs text-muted-foreground">
          {hist.map((h, i) => (
            <li key={i}><b>{new Date(h.em).toLocaleString("pt-BR")}</b> · {h.usuario} · {{ enviado: "enviou para aprovação", aprovado: "aprovou", reprovado: "devolveu", cotacao: "gerou cotação" }[h.acao]}{h.obs ? ` — ${h.obs}` : ""}</li>
          ))}
        </ol>
      )}
      {ultimo?.acao === "aprovado" && ultimo.obs && status === "aprovado" && <p className="text-xs text-muted-foreground">Obs. da aprovação: {ultimo.obs}</p>}
    </section>
  );
}
