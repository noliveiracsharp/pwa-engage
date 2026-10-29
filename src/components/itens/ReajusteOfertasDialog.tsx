import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatBRL } from "@/lib/orcamentos";
import { etapaDaOferta, type EtapaRef } from "@/lib/oferta-ativacao";
import { marcadaPorPadrao, reajustarOferta, vendaTravada, type ModoReajuste, type NovoPreco } from "@/lib/reajuste-itens";

const db = supabase as any;

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  itemId: string;
  itemNome: string;
  novo: NovoPreco;
};

export function ReajusteOfertasDialog({ open, onOpenChange, itemId, itemNome, novo }: Props) {
  const qc = useQueryClient();
  const [modo, setModo] = useState<ModoReajuste>("custo");
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [rodando, setRodando] = useState(false);

  const { data, isLoading } = useQuery({
    enabled: open && !!itemId,
    queryKey: ["reajuste-ofertas", itemId],
    queryFn: async () => {
      const { data: li, error } = await db.from("orcamento_itens").select("orcamento_id").eq("item_id", itemId);
      if (error) throw error;
      const ids = [...new Set((li ?? []).map((r: any) => String(r.orcamento_id)))];
      if (!ids.length) return { ofertas: [] as any[], etapas: [] as EtapaRef[] };
      const [{ data: ofertas }, { data: et }] = await Promise.all([
        db.from("orcamentos").select("*").in("id", ids),
        db.from("kanban_etapas").select("*"),
      ]);
      const etapas: EtapaRef[] = (et ?? []).map((e: any) => ({ id: String(e.id), descricao: String(e.descricao ?? ""), ganha: !!e.etapa_ganha }));
      return { ofertas: ofertas ?? [], etapas };
    },
  });

  const grupos = useMemo(() => {
    const m = new Map<string, { situacao: string; travada: boolean; ofertas: any[] }>();
    for (const o of data?.ofertas ?? []) {
      const s = String(o.situacao ?? "") || "Em andamento";
      const g = m.get(s) ?? { situacao: s, travada: vendaTravada(s, etapaDaOferta(o, data!.etapas)), ofertas: [] };
      g.ofertas.push(o);
      m.set(s, g);
    }
    return [...m.values()].sort((a, b) => a.situacao.localeCompare(b.situacao, "pt-BR"));
  }, [data]);

  useEffect(() => {
    if (open) setMarcadas(new Set(grupos.filter((g) => marcadaPorPadrao(g.situacao)).map((g) => g.situacao)));
  }, [open, grupos]);

  const alvo = grupos.filter((g) => marcadas.has(g.situacao));
  const total = alvo.reduce((s, g) => s + g.ofertas.length, 0);

  async function aplicar() {
    setRodando(true);
    let ok = 0;
    try {
      for (const g of alvo) {
        for (const o of g.ofertas) {
          const { data: linhas, error } = await db.from("orcamento_itens").select("*").eq("orcamento_id", o.id);
          if (error) throw error;
          // Serviço terceirizado mantém o custo negociado com o prestador: não é alvo do reajuste.
          const r = reajustarOferta(o, (linhas ?? []).map((l: any) => ({ ...l, id: String(l.id), item_id: l.execucao === "terceiro" ? null : l.item_id })), itemId, novo, modo, g.travada);
          for (const l of r.linhas) {
            const { error: e } = await db.from("orcamento_itens").update(l.patch).eq("id", l.id);
            if (e) throw e;
          }
          const t = r.totais;
          const { error: e2 } = await db
            .from("orcamentos")
            .update({
              total_itens: t.total_itens,
              desconto_valor: t.desconto_valor,
              total_liquido: t.total_liquido,
              total_custo: t.total_custo,
              total_imposto: t.total_imposto,
              total_lucro: t.total_lucro,
              margem_pct: t.margem_pct,
            })
            .eq("id", o.id);
          if (e2) throw e2;
          ok += 1;
        }
      }
      toast.success(`${ok} oferta(s) reajustada(s).`);
      qc.invalidateQueries();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Falha ao reajustar ofertas", { description: `${ok} concluída(s). ${e?.message ?? ""}` });
    } finally {
      setRodando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !rodando && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Atualizar Ofertas com este item?</DialogTitle>
          <DialogDescription>
            {itemNome}: custo {formatBRL(novo.preco_custo)}
            {novo.preco_venda !== null ? ` · venda ${formatBRL(novo.preco_venda)}` : ""}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Procurando Ofertas…</p>
        ) : !grupos.length ? (
          <p className="text-muted-foreground text-sm">Nenhuma Oferta usa este item.</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Situações a recalcular</Label>
              {grupos.map((g) => (
                <label key={g.situacao} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Checkbox
                    checked={marcadas.has(g.situacao)}
                    onCheckedChange={(c) =>
                      setMarcadas((p) => {
                        const n = new Set(p);
                        if (c) n.add(g.situacao);
                        else n.delete(g.situacao);
                        return n;
                      })
                    }
                  />
                  <span className="flex-1">{g.situacao}</span>
                  {g.travada && (
                    <span className="text-muted-foreground flex items-center gap-1 text-xs">
                      <Lock className="size-3" /> só custo
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs">{g.ofertas.length}</span>
                </label>
              ))}
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setMarcadas(new Set(grupos.map((g) => g.situacao)))}>
                Marcar todas
              </Button>
            </div>

            <RadioGroup value={modo} onValueChange={(v) => setModo(v as ModoReajuste)} className="space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <RadioGroupItem value="custo" className="mt-0.5" />
                <span>Atualizar só custo, lucro e margem (mantém o valor combinado com o cliente)</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <RadioGroupItem value="custo_venda" className="mt-0.5" disabled={novo.preco_venda === null} />
                <span>Atualizar custo e preço de venda nas Ofertas em negociação</span>
              </label>
            </RadioGroup>
            <p className="text-muted-foreground text-xs">
              <Lock className="mr-1 inline size-3" />
              Ofertas aprovadas, ganhas ou em Ativação nunca mudam o valor de venda, para não divergir de contrato, notas e Contas a Receber.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={rodando}>
            Não atualizar
          </Button>
          <Button onClick={aplicar} disabled={rodando || !total}>
            {rodando ? "Atualizando…" : `Atualizar ${total} oferta(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
