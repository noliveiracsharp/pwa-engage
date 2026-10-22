import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { supabase } from "@/integrations/supabase/client";
import { rowId, useTableRows } from "@/lib/crud";
import { entradasDoPedido } from "@/lib/estoque";
import { titulosDoPedido } from "@/lib/financeiro";
import { contarTitulosDaOrigem, erroFinanceiro, fontesDoPedido, inserirTitulos } from "@/lib/financeiro-db";
import { formatBRL, num } from "@/lib/orcamentos";
import type { Row } from "@/lib/row";

const somaDias = (dias: number) => { const d = new Date(); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); };

/** Recebe o pedido de compra: entrada no estoque + contas a pagar do fornecedor, de uma vez. */
export function ReceberPedidoDialog({ pedido, empresaId, onClose, onDone }: { pedido: Row; empresaId: string; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: locais = [] } = useTableRows("estoque_locais");
  const [entrada, setEntrada] = useState(true);
  const [gerarPagar, setGerarPagar] = useState(true);
  const [local, setLocal] = useState("");
  const [parcelas, setParcelas] = useState(1);
  const [vencimento, setVencimento] = useState(somaDias(30));
  const [jaTemTitulos, setJaTemTitulos] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = String(pedido["id"]);
  const emp = String(pedido["empresa_id"] ?? empresaId);
  const total = num(pedido["total"]);

  const locOpts = useMemo(() => locais
    .filter((l) => l["status"] !== false && String(l["empresa_id"] ?? "") === emp && l["tipo"] !== "Cliente / Comodato")
    .map((l) => ({ value: String(rowId(l)), label: String(l["descricao"] ?? "Local") }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")), [locais, emp]);
  useEffect(() => { if (!local && locOpts.length) setLocal(locOpts[0]!.value); }, [locOpts, local]);
  useEffect(() => {
    void contarTitulosDaOrigem([id], ["pedido"]).then((n) => { setJaTemTitulos(n > 0); if (n > 0) setGerarPagar(false); }).catch(() => {});
  }, [id]);

  async function confirmar() {
    setBusy(true);
    const msgs: string[] = [];
    try {
      const documento = `Pedido ${String(pedido["numero"] ?? id.slice(0, 8))}`;
      if (entrada) {
        const ja = await supabase.from("estoque_movimentacoes").select("id", { count: "exact", head: true }).eq("empresa_id", emp).eq("documento", documento);
        if (ja.error) throw ja.error;
        if ((ja.count ?? 0) > 0) msgs.push("estoque já tinha recebido este pedido");
        else {
          const itens = await supabase.from("pedidos_compra_itens").select("*").eq("pedido_id", id);
          if (itens.error) throw itens.error;
          const ids = [...new Set((itens.data ?? []).map((i) => String(i.item_id ?? "")).filter(Boolean))];
          const cad = ids.length ? await supabase.from("itens").select("id, controla_estoque").in("id", ids) : { data: [], error: null };
          if (cad.error) throw cad.error;
          const controla = new Set((cad.data ?? []).filter((c) => c.controla_estoque !== false).map((c) => String(c.id)));
          const movs = entradasDoPedido((itens.data ?? []) as Row[], controla);
          if (movs.length) {
            if (!local) throw new Error("Escolha o local onde a mercadoria vai entrar.");
            const { error } = await supabase.from("estoque_movimentacoes").insert(movs.map((m) => ({
              ...m, empresa_id: emp, tipo: "entrada_compra", local_destino_id: local, documento,
              observacoes: `Recebimento do ${documento}`,
            })) as never);
            if (error) throw error;
            msgs.push(`${movs.length} produto(s) no estoque`);
            qc.invalidateQueries({ queryKey: ["table", "estoque_movimentacoes"] });
          }
        }
      }
      if (gerarPagar && !jaTemTitulos && total > 0) {
        const n = Math.max(1, Math.min(48, Math.floor(parcelas) || 1));
        const cronograma = Array.from({ length: n }, (_, i) => {
          const d = new Date(`${vencimento}T12:00:00`); d.setMonth(d.getMonth() + i);
          return { numero: i + 1, vencimento: d.toISOString().slice(0, 10), valor: 1 };
        });
        const qtd = await inserirTitulos(emp, titulosDoPedido({ pedidoId: id, numero: String(pedido["numero"] ?? ""), fornecedorId: String(pedido["fornecedor_id"]), total, cronograma }), { fontes: await fontesDoPedido(id) });
        msgs.push(`${qtd} conta(s) a pagar`);
        qc.invalidateQueries({ queryKey: ["table", "financeiro_titulos"] });
      }
      const { error } = await supabase.from("pedidos_compra").update({ status: "recebido" } as never).eq("id", id);
      if (error) throw error;
      toast.success(`Pedido recebido${msgs.length ? `: ${msgs.join(", ")}` : ""}.`);
      onDone(); onClose();
    } catch (e) {
      toast.error(erroFinanceiro(e));
    } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PackageCheck className="h-5 w-5 text-primary" /> Receber mercadoria</DialogTitle>
          <DialogDescription>Pedido {String(pedido["numero"] ?? "")} · {formatBRL(total)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="rp-est">Dar entrada no estoque</Label>
            <Switch id="rp-est" checked={entrada} onCheckedChange={setEntrada} />
          </div>
          {entrada && (
            <div className="space-y-1 rounded-md border p-3">
              <Label>Entra no local</Label>
              <SearchSelect value={local} onChange={setLocal} options={locOpts} placeholder="Escolha o local de estoque" />
              <p className="text-muted-foreground text-xs">Só produtos com "controla estoque" ligado, com o custo do pedido.</p>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="rp-fin">Gerar contas a pagar do fornecedor</Label>
            <Switch id="rp-fin" checked={gerarPagar} onCheckedChange={setGerarPagar} disabled={jaTemTitulos} />
          </div>
          {jaTemTitulos && <p className="text-muted-foreground text-xs">Este pedido já tem contas a pagar no Financeiro.</p>}
          {gerarPagar && !jaTemTitulos && (
            <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
              <div className="space-y-1"><Label>1º vencimento</Label><Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} /></div>
              <div className="space-y-1"><Label>Parcelas (mensais)</Label><Input type="number" min={1} max={48} value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))} /></div>
              {pedido["condicao_pagamento"] ? <p className="text-muted-foreground text-xs sm:col-span-2">Condição combinada: {String(pedido["condicao_pagamento"])}</p> : null}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirmar} disabled={busy}>Confirmar recebimento</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
