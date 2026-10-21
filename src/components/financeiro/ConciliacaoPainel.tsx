import { useEffect, useMemo, useState } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { confirmar } from "@/components/layout/DialogoGlobal";
import { sugerirConciliacao, type Movimento, type TituloAberto } from "@/lib/conciliacao";
import { formatBRL } from "@/lib/orcamentos";
import { rowId, text } from "@/lib/crud";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";

const dataBR = (s: string) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "—");

/** Compara o extrato com os títulos em aberto e dá baixa nos que o usuário confirmar. */
export function ConciliacaoPainel({ conta, movs, onFeito }: { conta: Row; movs: Movimento[]; onFeito: () => void }) {
  const qc = useQueryClient();
  const empresaId = text(conta["empresa_id"]);
  const [titulos, setTitulos] = useState<TituloAberto[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    void (async () => {
      let q = supabase.from("financeiro_titulos").select("id,tipo,valor,valor_pago,vencimento,descricao,parceiro_id").eq("status", "aberto");
      if (empresaId) q = q.eq("empresa_id", empresaId);
      const { data, error } = await q.limit(1000);
      if (error) { toast.error(error.message); setTitulos([]); return; }
      const ids = [...new Set((data ?? []).map((t) => text((t as Row)["parceiro_id"])).filter(Boolean))];
      const nomes = new Map<string, string>();
      if (ids.length) {
        const { data: ps } = await supabase.from("parceiros").select("id,nome_fantasia,razao_social").in("id", ids);
        for (const p of (ps ?? []) as Row[]) nomes.set(text(rowId(p)), text(p["nome_fantasia"] || p["razao_social"]));
      }
      setTitulos((data ?? []).map((r) => {
        const t = r as Row;
        return { id: text(t["id"]), tipo: text(t["tipo"]), valor: Number(t["valor"]) || 0, valor_pago: Number(t["valor_pago"]) || 0,
          vencimento: text(t["vencimento"]), descricao: text(t["descricao"]), nome: nomes.get(text(t["parceiro_id"])) ?? "" };
      }));
    })();
  }, [empresaId]);

  const pares = useMemo(() => (titulos ? sugerirConciliacao(movs, titulos) : []), [movs, titulos]);
  useEffect(() => { setMarcados(new Set(pares.filter((p) => p.confianca === "alta").map((p) => p.tituloId))); }, [pares]);
  const porId = useMemo(() => new Map((titulos ?? []).map((t) => [t.id, t])), [titulos]);

  const baixar = async () => {
    const sel = pares.filter((p) => marcados.has(p.tituloId));
    if (!sel.length) return;
    if (!(await confirmar({ title: "Dar baixa", description: `Dar baixa em ${sel.length} título(s) com a data do extrato?`, confirmText: "Dar baixa" } as never))) return;
    setSalvando(true);
    try {
      for (const p of sel) {
        const m = movs[p.mov]!;
        const t = porId.get(p.tituloId)!;
        const { error } = await supabase.from("financeiro_titulos").update({
          status: "pago", pago_em: m.data.slice(0, 10), valor_pago: Math.round(((t.valor_pago ?? 0) + m.valor) * 100) / 100,
          agendado_para: null, conta_bancaria_id: text(rowId(conta)) || null,
        } as never).eq("id", p.tituloId).eq("status", "aberto");
        if (error) throw error;
      }
      await qc.invalidateQueries({ queryKey: ["table", "financeiro_titulos"] });
      toast.success(`${sel.length} título(s) baixado(s).`);
      onFeito();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSalvando(false); }
  };

  if (!titulos) return <p className="text-muted-foreground flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Procurando títulos em aberto...</p>;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">Conciliação</p>
          <p className="text-muted-foreground text-xs">
            {pares.length} de {movs.length} movimentações encontraram um título com o mesmo valor e vencimento até 10 dias.
          </p>
        </div>
        <Button size="sm" onClick={baixar} disabled={salvando || !marcados.size}>
          {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-1 h-4 w-4" />}
          Dar baixa ({marcados.size})
        </Button>
      </div>
      {!pares.length ? <p className="text-muted-foreground text-sm">Nenhuma correspondência encontrada.</p> : (
        <div className="divide-y rounded-md border">
          {pares.map((p) => {
            const m = movs[p.mov]!; const t = porId.get(p.tituloId)!;
            const on = marcados.has(p.tituloId);
            return (
              <label key={p.tituloId} className="flex cursor-pointer items-start gap-3 p-2.5 text-sm">
                <Checkbox checked={on} onCheckedChange={(v) => setMarcados((s) => { const n = new Set(s); if (v) n.add(p.tituloId); else n.delete(p.tituloId); return n; })} />
                <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.titulo || m.descricao || m.tipo}</p>
                    <p className="text-muted-foreground text-xs">Banco • {dataBR(m.data)} • {m.operacao === "C" ? "+" : "−"}{formatBRL(m.valor)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.nome || t.descricao || "Título"}</p>
                    <p className="text-muted-foreground text-xs">{t.tipo === "receber" ? "A receber" : "A pagar"} • vence {dataBR(t.vencimento)}</p>
                  </div>
                </div>
                <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-xs", p.confianca === "alta" ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                  {p.confianca === "alta" ? "Certeiro" : "Conferir"}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
