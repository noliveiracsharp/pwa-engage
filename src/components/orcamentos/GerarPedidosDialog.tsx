import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { supabase } from "@/integrations/supabase/client";
import { proximoNumero } from "@/lib/laudos";
import {
  COMPRA_MODOS,
  condicaoCompraFromValue,
  formatBRL,
  formatDate,
  num,
  parcelasFromValue,
  round2,
} from "@/lib/orcamentos";
import { rowId } from "@/lib/crud";
import type { Row } from "@/lib/row";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orcamento: Row | null;
  linhas: Row[];
  itens: Row[];
  parceiros: Row[];
};

type Linha = { linha: Row; item: Row | undefined; qtd: number; custo: number; fornecedor: string };

/** Desdobra os itens de produto da Oferta em Pedido(s) de Compra. */
export function GerarPedidosDialog({ open, onOpenChange, orcamento, linhas, itens, parceiros }: Props) {
  const qc = useQueryClient();
  const [modo, setModo] = useState<"porFornecedor" | "unico">("porFornecedor");
  const [padrao, setPadrao] = useState("");
  const [forn, setForn] = useState<Record<string, string>>({});
  const [gerando, setGerando] = useState(false);

  const itemById = useMemo(() => new Map(itens.map((i) => [String(rowId(i)), i])), [itens]);
  const fornecedores = useMemo(
    () =>
      parceiros
        .filter((p) => p["is_fornecedor"] === true)
        .map((p) => ({
          value: String(rowId(p)),
          label: String(p["nome_fantasia"] || p["razao_social"] || "—"),
          keywords: [String(p["razao_social"] ?? ""), String(p["cnpj"] ?? p["documento"] ?? "")],
        })),
    [parceiros],
  );

  useEffect(() => {
    if (open) { setForn({}); setPadrao(""); setModo("porFornecedor"); }
  }, [open, orcamento]);

  const base: Linha[] = useMemo(
    () =>
      linhas
        .filter((l) => String(l["natureza"] ?? "produto") === "produto" && num(l["quantidade"]) > 0)
        .map((l) => {
          const item = itemById.get(String(l["item_id"] ?? ""));
          const fornItem = String(item?.["fornecedor_id"] ?? item?.["parceiro_id"] ?? "");
          return { linha: l, item, qtd: num(l["quantidade"]), custo: num(l["preco_custo"]), fornecedor: fornItem };
        }),
    [linhas, itemById],
  );

  const keyOf = (l: Row, i: number) => String(rowId(l) ?? i);
  const fornDe = (l: Linha, i: number) =>
    modo === "unico" ? padrao : forn[keyOf(l.linha, i)] || l.fornecedor || padrao;

  const grupos = useMemo(() => {
    const m = new Map<string, Linha[]>();
    base.forEach((l, i) => {
      const f = fornDe(l, i);
      m.set(f, [...(m.get(f) ?? []), l]);
    });
    return m;
  }, [base, forn, padrao, modo]); // eslint-disable-line react-hooks/exhaustive-deps

  const faltando = grupos.has("");
  const total = round2(base.reduce((s, l) => s + l.qtd * l.custo, 0));
  const cond = condicaoCompraFromValue(orcamento?.["compra_condicao"]);
  const cronograma = parcelasFromValue(orcamento?.["compra_parcelas"]);
  const condTexto = [
    COMPRA_MODOS.find((m) => m.value === cond.modo)?.label,
    cronograma.length ? `${cronograma.length}x (1º venc. ${formatDate(cronograma[0]?.vencimento)})` : "",
    cond.obs,
  ].filter(Boolean).join(" — ");

  const gerar = async () => {
    if (!orcamento) return;
    setGerando(true);
    try {
      const empresaId = orcamento["empresa_id"] as string | undefined;
      let n = 0;
      for (const [fid, ls] of grupos) {
        const totalG = round2(ls.reduce((s, l) => s + l.qtd * l.custo, 0));
        const numero = await proximoNumero("pedidos_compra", "PC", empresaId);
        const { data, error } = await supabase
          .from("pedidos_compra")
          .insert({
            empresa_id: empresaId, orcamento_id: String(rowId(orcamento)), fornecedor_id: fid, numero,
            status: "rascunho", condicao_pagamento: condTexto || null, total: totalG,
            observacao: `Gerado da Oferta ${String(orcamento["numero"] ?? "")}`.trim(),
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        const pid = String((data as Row)["id"]);
        const { error: e2 } = await supabase.from("pedidos_compra_itens").insert(
          ls.map((l) => ({
            pedido_id: pid, item_id: l.linha["item_id"] ?? null, quantidade: l.qtd,
            preco_unitario: l.custo, total: round2(l.qtd * l.custo),
          })) as never,
        );
        if (e2) throw e2;
        n++;
      }
      toast.success(n === 1 ? "1 pedido de compra gerado (em Cotações › Pedidos)." : `${n} pedidos de compra gerados.`);
      qc.invalidateQueries({ queryKey: ["table", "pedidos_compra"] });
      onOpenChange(false);
    } catch (e) {
      const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? "");
      toast.error(m.includes("orcamento_id") ? "Rode o script atendeai-pedidos-oferta.sql no banco." : m || "Falha ao gerar pedidos.");
    } finally {
      setGerando(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Gerar pedidos de compra</SheetTitle>
          <SheetDescription>
            Oferta {String(orcamento?.["numero"] ?? "")} — produtos com o custo previsto. Pagamento: {condTexto || "—"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <ToggleGroup type="single" variant="outline" className="justify-start" value={modo}
            onValueChange={(v) => v && setModo(v as typeof modo)}>
            <ToggleGroupItem value="porFornecedor" className="px-3 text-xs">Um pedido por fornecedor</ToggleGroupItem>
            <ToggleGroupItem value="unico" className="px-3 text-xs">Pedido único</ToggleGroupItem>
          </ToggleGroup>

          <div className="space-y-1">
            <Label className="text-sm">{modo === "unico" ? "Fornecedor" : "Fornecedor padrão (itens sem fornecedor)"}</Label>
            <SearchSelect value={padrao} onChange={setPadrao} options={fornecedores} placeholder="Escolha o fornecedor" />
          </div>

          {base.length === 0 ? (
            <p className="text-muted-foreground text-sm">Esta oferta não tem produtos para comprar.</p>
          ) : (
            <div className="divide-y rounded-lg border">
              {base.map((l, i) => (
                <div key={keyOf(l.linha, i)} className="grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{String(l.item?.["descricao"] ?? l.linha["descricao"] ?? "Item")}</p>
                    <p className="text-muted-foreground text-xs">{l.qtd} × {formatBRL(l.custo)} = {formatBRL(l.qtd * l.custo)}</p>
                  </div>
                  {modo === "porFornecedor" && (
                    <SearchSelect className="sm:w-64" value={fornDe(l, i)} options={fornecedores} placeholder="Fornecedor"
                      onChange={(v) => setForn((s) => ({ ...s, [keyOf(l.linha, i)]: v }))} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t p-4">
          <span className="text-sm">
            {grupos.size} pedido(s) • <strong>{formatBRL(total)}</strong>
            {faltando && <span className="text-destructive ml-2">Defina o fornecedor de todos os itens.</span>}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button disabled={gerando || faltando || base.length === 0} onClick={gerar}>
              {gerando ? "Gerando…" : "Gerar pedidos"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
