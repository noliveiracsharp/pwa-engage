import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListTree } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { rowId, text, useTableRows } from "@/lib/crud";
import { formatBRL, num, round2 } from "@/lib/orcamentos";
import type { Row } from "@/lib/row";

/** Itens discriminados apenas dos títulos informados (os da tela), agrupados por título. */
export function useItensPorTitulo(ids: string[]) {
  const lista = [...new Set(ids.filter(Boolean))].sort();
  const q = useQuery({
    queryKey: ["financeiro_titulos_itens", "ids", lista.join(",")],
    enabled: lista.length > 0,
    queryFn: async () => {
      const out: Row[] = [];
      for (let i = 0; i < lista.length; i += 150) {
        const { data, error } = await supabase.from("financeiro_titulos_itens" as never).select("*").in("titulo_id", lista.slice(i, i + 150) as never).order("created_at");
        if (error) return [] as Row[];
        out.push(...((data ?? []) as Row[]));
      }
      return out;
    },
  });
  return useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of q.data ?? []) {
      const k = text(r["titulo_id"]);
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return m;
  }, [q.data]);
}

export function ItensChip({ qtd, onClick }: { qtd: number; onClick: () => void }) {
  if (!qtd) return null;
  return (
    <button type="button" className="text-primary bg-primary/10 hover:bg-primary/20 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold"
      onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label="Ver itens do título">
      <ListTree className="h-3.5 w-3.5" /> {qtd} {qtd === 1 ? "item" : "itens"}
    </button>
  );
}

export function ItensTituloDialog({ titulo, itens, nomeParceiro, onClose, onEditar }: {
  titulo: Row | null; itens: Row[]; nomeParceiro: string; onClose: () => void; onEditar?: () => void;
}) {
  const { data: centros = [] } = useTableRows("centro_custo");
  const { data: contas = [] } = useTableRows("plano_contas");
  const nome = (rows: Row[], id: unknown) => {
    const r = rows.find((x) => text(rowId(x)) === text(id));
    return r ? [text(r["codigo"]), text(r["descricao"] ?? r["nome"])].filter(Boolean).join(" - ") : "—";
  };
  const soma = round2(itens.reduce((s, r) => s + num(r["valor"]), 0));
  const valor = num(titulo?.["valor"]);
  const dif = round2(valor - soma);
  return (
    <Dialog open={!!titulo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col">
        <DialogHeader><DialogTitle>Itens do título</DialogTitle></DialogHeader>
        {titulo && (
          <div className="flex min-h-0 flex-1 flex-col space-y-3">
            <div className="text-muted-foreground text-sm">
              <p className="text-foreground font-medium">{text(titulo["descricao"])}</p>
              <p>{nomeParceiro || "—"} • Vencimento {text(titulo["vencimento"]).split("-").reverse().join("/")}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto overscroll-contain rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground sticky top-0 z-10 text-xs">
                  <tr><th className="p-2 text-left">#</th><th className="p-2 text-left">Item</th><th className="p-2 text-left">Centro de custo</th><th className="p-2 text-left">Conta</th><th className="p-2 text-right">Valor</th></tr>
                </thead>
                <tbody>
                  {itens.map((r, i) => (
                    <tr key={text(rowId(r)) || i} className="border-t">
                      <td className="p-2 tabular-nums">{i + 1}</td>
                      <td className="p-2">{text(r["descricao"]) || "—"}</td>
                      <td className="p-2">{nome(centros, r["centro_custo_id"])}</td>
                      <td className="p-2">{nome(contas, r["plano_contas_id"])}</td>
                      <td className="p-2 text-right font-medium tabular-nums">{formatBRL(r["valor"])}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-background sticky bottom-0 border-t font-semibold">
                  <tr><td colSpan={4} className="p-2 text-right">Soma dos itens</td><td className="p-2 text-right tabular-nums">{formatBRL(soma)}</td></tr>
                  <tr><td colSpan={4} className="text-muted-foreground p-2 text-right font-normal">Valor do título</td><td className="p-2 text-right tabular-nums">{formatBRL(valor)}</td></tr>
                  {dif !== 0 && <tr><td colSpan={4} className="text-destructive p-2 text-right font-normal">Diferença</td><td className="text-destructive p-2 text-right tabular-nums">{formatBRL(dif)}</td></tr>}
                </tfoot>
              </table>
            </div>
            {onEditar && (
              <div className="flex justify-end">
                <button type="button" className="text-primary text-sm font-medium hover:underline" onClick={onEditar}>Editar título e itens</button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
