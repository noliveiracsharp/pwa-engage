import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatQtd } from "@/lib/orcamentos";

type Linha = { id: string; data: string; numero: string; fornecedor: string; quantidade: number; preco: number; status: string };

const STATUS: Record<string, string> = { rascunho: "Rascunho", enviado: "Enviado", recebido: "Recebido", cancelado: "Cancelado" };

/** Últimas 5 compras (pedidos de compra) do item. */
export function HistoricoCompras({ itemId }: { itemId: string }) {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["historico-compras", itemId],
    queryFn: async (): Promise<Linha[]> => {
      const { data: itens, error: e1 } = await supabase.from("pedidos_compra_itens").select("*").eq("item_id", itemId);
      if (e1) throw e1;
      const linhas = (itens ?? []) as Array<Record<string, unknown>>;
      const pids = [...new Set(linhas.map((l) => String(l["pedido_id"])))];
      if (!pids.length) return [];
      const { data: peds } = await supabase.from("pedidos_compra").select("*").in("id", pids);
      const pedidos = new Map(((peds ?? []) as Array<Record<string, unknown>>).filter((p) => p["status"] !== "cancelado").map((p) => [String(p["id"]), p]));
      const fids = [...new Set([...pedidos.values()].map((p) => String(p["fornecedor_id"])))];
      const { data: fs } = fids.length ? await supabase.from("parceiros").select("*").in("id", fids) : { data: [] };
      const forn = new Map(((fs ?? []) as Array<Record<string, unknown>>).map((f) => [String(f["id"]), String(f["nome_fantasia"] ?? f["razao_social"] ?? f["nome"] ?? "—")]));
      return linhas
        .filter((l) => pedidos.has(String(l["pedido_id"])))
        .map((l) => {
          const p = pedidos.get(String(l["pedido_id"]))!;
          return {
            id: String(l["id"]),
            data: String(p["enviado_em"] ?? p["created_at"] ?? ""),
            numero: String(p["numero"] ?? "—"),
            fornecedor: forn.get(String(p["fornecedor_id"])) ?? "—",
            quantidade: Number(l["quantidade"]) || 0,
            preco: Number(l["preco_unitario"]) || 0,
            status: STATUS[String(p["status"])] ?? String(p["status"] ?? "—"),
          };
        })
        .sort((a, b) => b.data.localeCompare(a.data))
        .slice(0, 5);
    },
  });

  if (isLoading) return <p className="text-muted-foreground py-4 text-sm">Carregando histórico…</p>;
  if (error) return <p className="text-destructive py-4 text-sm">Não foi possível carregar o histórico de compras.</p>;
  if (!data.length) return <p className="text-muted-foreground py-4 text-sm">Nenhuma compra registrada para este item ainda.</p>;

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="p-2 text-left">Data</th>
            <th className="p-2 text-left">Pedido</th>
            <th className="p-2 text-left">Fornecedor</th>
            <th className="p-2 text-right">Qtd.</th>
            <th className="p-2 text-right">Preço unit.</th>
            <th className="p-2 text-left">Situação</th>
          </tr>
        </thead>
        <tbody>
          {data.map((l) => (
            <tr key={l.id} className="border-t">
              <td className="p-2">{l.data ? new Date(l.data).toLocaleDateString("pt-BR") : "—"}</td>
              <td className="p-2">{l.numero}</td>
              <td className="p-2">{l.fornecedor}</td>
              <td className="p-2 text-right tabular-nums">{formatQtd(l.quantidade)}</td>
              <td className="p-2 text-right tabular-nums">{formatBRL(l.preco)}</td>
              <td className="p-2">{l.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
