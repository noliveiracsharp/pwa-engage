import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { useTableRows, rowId } from "@/lib/crud";
import { hojeISO, type OpcoesFinanceiroOferta } from "@/lib/financeiro";
import { condicaoCompraFromValue, formatBRL, num, round2 } from "@/lib/orcamentos";
import type { Row } from "@/lib/row";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  oferta: Row | null;
  itens: Row[];
  empresaId: string;
  onConfirmar: (opcoes: OpcoesFinanceiroOferta) => void | Promise<void>;
};

const custoLinha = (l: Row) => num(l["custo_total"]) || num(l["preco_custo"]) * num(l["quantidade"]);
const txt = (v: unknown) => String(v ?? "");

/** Assistente: escolhe como cada parte da Oferta vai para o Financeiro (a receber e a pagar). */
export function GerarFinanceiroOfertaDialog({ open, onOpenChange, oferta, itens, empresaId, onConfirmar }: Props) {
  const { data: cartoes = [] } = useTableRows("despesas_cartoes");
  const { data: parceiros = [] } = useTableRows("parceiros");
  const [separar, setSeparar] = useState(false);
  const [modo, setModo] = useState<"fornecedor" | "cartao" | "pedido">("fornecedor");
  const [cartaoId, setCartaoId] = useState("");
  const [parcCartao, setParcCartao] = useState("1");
  const [dataCompra, setDataCompra] = useState(hojeISO());
  const [terc, setTerc] = useState<Record<string, { parcelas: string; primeiro: string }>>({});
  const [salvando, setSalvando] = useState(false);

  const temProduto = itens.some((i) => txt(i["natureza"]) === "produto");
  const temServico = itens.some((i) => !["produto", "recorrente"].includes(txt(i["natureza"])));
  const custoProd = useMemo(() => round2(itens.filter((i) => i["execucao"] !== "terceiro").reduce((s, l) => s + custoLinha(l), 0)), [itens]);
  const fornecedores = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of itens) if (l["execucao"] === "terceiro" && txt(l["fornecedor_id"]) && txt(l["natureza"]) !== "recorrente")
      m.set(txt(l["fornecedor_id"]), round2((m.get(txt(l["fornecedor_id"])) ?? 0) + custoLinha(l)));
    return [...m.entries()];
  }, [itens]);
  const nomeParc = (id: string) => { const p = parceiros.find((x) => txt(rowId(x)) === id); return txt(p?.["nome_fantasia"] || p?.["razao_social"]) || "Fornecedor"; };
  const opcoesCartao = useMemo(() => cartoes
    .filter((c) => c["ativo"] !== false && (!empresaId || !c["empresa_id"] || txt(c["empresa_id"]) === empresaId))
    .map((c) => ({ value: txt(rowId(c)), label: txt(c["descricao"]) || "Cartão" }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")), [cartoes, empresaId]);

  useEffect(() => {
    if (!open) return;
    setSeparar(false); setModo("fornecedor"); setCartaoId(""); setParcCartao("1"); setDataCompra(hojeISO()); setSalvando(false);
    const salvo = condicaoCompraFromValue(oferta?.["compra_condicao"]).terceiros ?? {};
    const inicioDe = (f: string) => itens.filter((l) => txt(l["fornecedor_id"]) === f).map((l) => txt(l["dt_inicio_faturamento"]).slice(0, 10)).filter(Boolean).sort()[0];
    setTerc(Object.fromEntries(fornecedores.map(([f]) => [f, { parcelas: salvo[f]?.parcelas || "1", primeiro: salvo[f]?.primeira || inicioDe(f) || hojeISO() }])));
  }, [open, fornecedores, oferta, itens]);

  const confirmar = async () => {
    const c = cartoes.find((x) => txt(rowId(x)) === cartaoId);
    if (modo === "cartao" && !c) return;
    setSalvando(true);
    try {
      await onConfirmar({
        separarProdutoServico: separar,
        produtos: modo === "cartao"
          ? { modo, cartaoId, parcelas: Math.max(1, Math.floor(num(parcCartao)) || 1), dataCompra,
              diaFechamento: num(c!["dia_fechamento"]) || 1, diaVencimento: num(c!["dia_vencimento"]) || 10 }
          : { modo },
        terceiros: Object.fromEntries(Object.entries(terc).map(([f, v]) => [f, { parcelas: Math.max(1, Math.floor(num(v.parcelas)) || 1), primeiro: v.primeiro }])),
      });
      onOpenChange(false);
    } finally { setSalvando(false); }
  };

  const Opcao = ({ v, label, desc }: { v: typeof modo; label: string; desc: string }) => (
    <button type="button" onClick={() => setModo(v)}
      className={`rounded-md border p-2 text-left text-sm ${modo === v ? "border-primary bg-primary/10" : "border-border"}`}>
      <div className="font-medium">{label}</div><div className="text-xs text-muted-foreground">{desc}</div>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar financeiro da Oferta {txt(oferta?.["numero"])}</DialogTitle>
          <DialogDescription>Confira como cada parte vai para Contas a receber e Contas a pagar.</DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Contas a receber</h3>
          <p className="text-xs text-muted-foreground">Mensalidades recorrentes sempre saem em cobranças próprias, com a data de início de cada item. Produtos e serviços avulsos seguem o parcelamento da Oferta, com valores de NF-e e NFS-e já separados.</p>
          {temProduto && temServico && (
            <div className="flex items-center justify-between rounded-md border p-2">
              <div><Label>Boletos separados para produtos e serviços</Label>
                <p className="text-xs text-muted-foreground">Desligado: um boleto por parcela, com o valor dividido por dentro.</p></div>
              <Switch checked={separar} onCheckedChange={setSeparar} />
            </div>
          )}
        </section>

        {custoProd > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Custo dos produtos ({formatBRL(custoProd)})</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Opcao v="fornecedor" label="Pagar fornecedor" desc="Segue a condição de compra da Oferta" />
              <Opcao v="cartao" label="Cartão de crédito" desc="Entra na fatura do cartão" />
              <Opcao v="pedido" label="Pedido de compra" desc="Lançado ao gerar o pedido" />
            </div>
            {modo === "cartao" && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="sm:col-span-3"><Label>Cartão</Label>
                  <SearchSelect value={cartaoId} onChange={setCartaoId} options={opcoesCartao} placeholder="Escolha o cartão" /></div>
                <div><Label>Parcelas no cartão</Label><Input type="number" min={1} max={48} value={parcCartao} onChange={(e) => setParcCartao(e.target.value)} /></div>
                <div><Label>Data da compra</Label><Input type="date" value={dataCompra} onChange={(e) => setDataCompra(e.target.value)} /></div>
                <p className="text-xs text-muted-foreground sm:col-span-3">Se a fatura daquele mês já existir, as parcelas são somadas a ela; senão a fatura é criada.</p>
              </div>
            )}
          </section>
        )}

        {fornecedores.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Serviços avulsos de terceiros</h3>
            {fornecedores.map(([f, v]) => (
              <div key={f} className="grid grid-cols-1 items-end gap-2 rounded-md border p-2 sm:grid-cols-3">
                <div><div className="text-sm font-medium">{nomeParc(f)}</div><div className="text-xs text-muted-foreground">{formatBRL(v)}</div></div>
                <div><Label>Parcelas</Label><Input type="number" min={1} max={120} value={terc[f]?.parcelas ?? "1"}
                  onChange={(e) => setTerc({ ...terc, [f]: { primeiro: terc[f]?.primeiro ?? hojeISO(), parcelas: e.target.value } })} /></div>
                <div><Label>1º vencimento</Label><Input type="date" value={terc[f]?.primeiro ?? hojeISO()}
                  onChange={(e) => setTerc({ ...terc, [f]: { parcelas: terc[f]?.parcelas ?? "1", primeiro: e.target.value } })} /></div>
              </div>
            ))}
          </section>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={confirmar} disabled={salvando || (modo === "cartao" && custoProd > 0 && !cartaoId)}>Confirmar e gerar financeiro</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
