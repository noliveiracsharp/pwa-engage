import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatQtd, num, round2 } from "@/lib/orcamentos";
import type { Row } from "@/lib/row";

type Linha = { preco: string; prazo: string; disponivel: boolean; marca: string; observacao: string };

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cotacaoId: string;
  fornecedor: Row | null;
  fornecedorNome: string;
  itensCot: Row[];
  precos: Row[];
  itemById: Map<string, Row>;
  onSaved: () => void;
};

const txt = (v: unknown) => (num(v) > 0 ? String(v).replace(".", ",") : "");

export function PreencherCotacaoDialog({ open, onOpenChange, cotacaoId, fornecedor, fornecedorNome, itensCot, precos, itemById, onSaved }: Props) {
  const fid = fornecedor ? String(fornecedor["fornecedor_id"]) : "";
  const [linhas, setLinhas] = useState<Record<string, Linha>>({});
  const [cond, setCond] = useState("");
  const [frete, setFrete] = useState("CIF");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open || !fornecedor) return;
    setLinhas(Object.fromEntries(itensCot.map((it) => {
      const p = precos.find((x) => String(x["cotacao_item_id"]) === String(it["id"]) && String(x["fornecedor_id"]) === fid);
      return [String(it["id"]), {
        preco: txt(p?.["preco_unitario"]), prazo: num(p?.["prazo_dias"]) > 0 ? String(p!["prazo_dias"]) : "",
        disponivel: p ? p["disponivel"] !== false : true, marca: String(p?.["marca"] ?? ""), observacao: String(p?.["observacao"] ?? ""),
      }];
    })));
    setCond(String(fornecedor["condicao_pagamento"] ?? ""));
    setFrete(String(fornecedor["frete"] ?? "CIF"));
    setObs(String(fornecedor["observacao_geral"] ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fid]);

  const total = useMemo(() => itensCot.reduce((s, it) => {
    const l = linhas[String(it["id"])];
    return l?.disponivel ? s + num(l.preco) * num(it["quantidade"]) : s;
  }, 0), [itensCot, linhas]);

  const set = (id: string, p: Partial<Linha>) => setLinhas((s) => ({ ...s, [id]: { ...s[id]!, ...p } }));

  const salvar = async () => {
    if (!fornecedor) return;
    setSalvando(true);
    try {
      const payload = itensCot.map((it) => {
        const l = linhas[String(it["id"])]!;
        const preco = l.disponivel ? num(l.preco) : 0;
        return {
          cotacao_id: cotacaoId, cotacao_item_id: String(it["id"]), fornecedor_id: fid,
          preco_unitario: preco, prazo_dias: Math.max(0, Math.floor(num(l.prazo))),
          disponivel: l.disponivel && preco > 0, marca: l.marca.trim() || null, observacao: l.observacao.trim() || null,
        };
      });
      const { error } = await supabase.from("cotacoes_precos").upsert(payload as never, { onConflict: "cotacao_item_id,fornecedor_id" });
      if (error) throw error;
      const { error: e2 } = await supabase.from("cotacoes_fornecedores").update({
        respondido: true, data_resposta: new Date().toISOString(), total_cotado: round2(total),
        condicao_pagamento: cond.trim() || null, frete, observacao_geral: obs.trim() || null,
      } as never).eq("id", String(fornecedor["id"]));
      if (e2) throw e2;
      toast.success(`Cotação de ${fornecedorNome} salva.`);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as { message?: string })?.message ?? "Falha ao salvar a cotação.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-panel-side="right" className="flex w-full flex-col gap-0 p-0">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>Preencher cotação — {fornecedorNome}</SheetTitle>
          <p className="text-muted-foreground text-sm">Use para compras em marketplace, balcão ou orçamentos recebidos por telefone/e-mail.</p>
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Condição de pagamento</Label>
              <Input value={cond} onChange={(e) => setCond(e.target.value)} placeholder="Ex.: Cartão 10x, Pix, Boleto 28 dias" />
            </div>
            <div className="space-y-1.5">
              <Label>Frete</Label>
              <Select value={frete} onValueChange={setFrete}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CIF">CIF (por conta do fornecedor)</SelectItem>
                  <SelectItem value="FOB">FOB (por nossa conta)</SelectItem>
                  <SelectItem value="Grátis">Frete grátis</SelectItem>
                  <SelectItem value="Retirada">Retirada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observações</Label>
              <Textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: link do anúncio, nome do vendedor, validade da oferta" rows={2} />
            </div>
          </div>

          <div className="space-y-3">
            {itensCot.map((it) => {
              const id = String(it["id"]);
              const l = linhas[id];
              if (!l) return null;
              const item = itemById.get(String(it["item_id"]));
              return (
                <div key={id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{String(item?.["descricao"] ?? "Item")}</div>
                      <div className="text-muted-foreground text-xs">Qtd. {formatQtd(it["quantidade"])}{item?.["codigo"] ? ` · ${String(item["codigo"])}` : ""}</div>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch checked={l.disponivel} onCheckedChange={(v) => set(id, { disponivel: v })} /> Disponível
                    </label>
                  </div>
                  {l.disponivel && (
                    <div className="grid gap-2 sm:grid-cols-4">
                      <Input value={l.preco} onChange={(e) => set(id, { preco: e.target.value })} inputMode="decimal" placeholder="Preço unit. (R$)" aria-label="Preço unitário" />
                      <Input value={l.prazo} onChange={(e) => set(id, { prazo: e.target.value })} inputMode="numeric" placeholder="Prazo (dias)" aria-label="Prazo em dias" />
                      <Input value={l.marca} onChange={(e) => set(id, { marca: e.target.value })} placeholder="Marca/modelo" aria-label="Marca" />
                      <Input value={l.observacao} onChange={(e) => set(id, { observacao: e.target.value })} placeholder="Observação" aria-label="Observação do item" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t px-6 py-4">
          <div className="text-sm">Total: <span className="font-semibold tabular-nums">{formatBRL(total)}</span></div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button disabled={salvando} onClick={salvar}>{salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
