import { Truck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTableRows, rowId } from "@/lib/crud";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  COMPRA_MODOS,
  formatBRL,
  formatDate,
  type CompraModo,
  type CondicaoCompra,
  type Parcela,
} from "@/lib/orcamentos";

type Props = {
  value: CondicaoCompra;
  custo: number;
  cronograma: Parcela[];
  readOnly?: boolean | undefined;
  /** Serviços avulsos terceirizados: um card por fornecedor. */
  terceiros?: Array<{ fornecedor: string; custo: number; inicio: string; parcelas: Parcela[] }>;
  onChange: (c: CondicaoCompra) => void;
};

/** Como o custo dos itens será pago ao fornecedor (alimenta o fluxo de caixa projetado). */
export function OrcamentoCompra({ value, custo, cronograma, readOnly, terceiros = [], onChange }: Props) {
  const set = (patch: Partial<CondicaoCompra>) => onChange({ ...value, ...patch });
  const { data: parceiros = [] } = useTableRows("parceiros");
  const nome = (id: string) => {
    const p = parceiros.find((x) => String(rowId(x)) === id);
    return String(p?.["nome_fantasia"] || p?.["razao_social"] || "Fornecedor");
  };
  const setTerc = (f: string, patch: Partial<{ parcelas: string; primeira: string }>) => {
    const atual = value.terceiros?.[f] ?? { parcelas: "1", primeira: "" };
    set({ terceiros: { ...(value.terceiros ?? {}), [f]: { ...atual, ...patch } } });
  };
  return (
    <div className="bg-card space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Truck className="text-muted-foreground h-4 w-4" />
        <h3 className="text-sm font-semibold">Pagamento ao fornecedor</h3>
        <span className="text-muted-foreground text-xs">(uso interno — custo {formatBRL(custo)})</span>
      </div>

      <ToggleGroup
        type="single"
        variant="outline"
        className="flex flex-wrap justify-start"
        value={value.modo}
        disabled={!!readOnly}
        onValueChange={(v) => v && set({ modo: v as CompraModo })}
      >
        {COMPRA_MODOS.map((m) => (
          <ToggleGroupItem key={m.value} value={m.value} className="px-3 text-xs">
            {m.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {value.modo !== "espelhar" && (
        <div className="grid gap-3 sm:grid-cols-3">
          {value.modo === "personalizado" && (
            <div className="space-y-1">
              <Label htmlFor="compra_parcelas" className="text-sm">Parcelas</Label>
              <Input
                id="compra_parcelas"
                type="number"
                min={1}
                max={60}
                value={value.parcelas}
                disabled={readOnly}
                onChange={(e) => set({ parcelas: e.target.value })}
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="compra_primeira" className="text-sm">
              {value.modo === "avista" ? "Data do pagamento" : "1º vencimento"}
            </Label>
            <Input
              id="compra_primeira"
              type="date"
              value={value.primeira}
              disabled={readOnly}
              onChange={(e) => set({ primeira: e.target.value })}
            />
          </div>
          <div className="space-y-1 sm:col-span-1">
            <Label htmlFor="compra_obs" className="text-sm">Observação</Label>
            <Input
              id="compra_obs"
              placeholder="Ex.: cartão corporativo, boleto 30/60"
              value={value.obs}
              disabled={readOnly}
              onChange={(e) => set({ obs: e.target.value })}
            />
          </div>
        </div>
      )}

      {cronograma.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {cronograma.map((p) => (
            <span key={p.numero} className="bg-muted rounded-md px-2 py-1 text-xs tabular-nums">
              {p.numero}ª {formatDate(p.vencimento)} · {formatBRL(p.valor)}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">Sem custo de itens para programar.</p>
      )}

      {terceiros.map((t) => {
        const cfg = value.terceiros?.[t.fornecedor];
        const idp = `terc-${t.fornecedor}`;
        return (
          <div key={t.fornecedor} className="bg-muted/30 space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold">{nome(t.fornecedor)}</h4>
              <span className="text-muted-foreground text-xs">serviço avulso terceirizado — custo {formatBRL(t.custo)}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`${idp}-n`} className="text-sm">Parcelas</Label>
                <Input id={`${idp}-n`} type="number" min={1} max={120} value={cfg?.parcelas ?? "1"} disabled={readOnly}
                  onChange={(e) => setTerc(t.fornecedor, { parcelas: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${idp}-d`} className="text-sm">1º vencimento</Label>
                <Input id={`${idp}-d`} type="date" value={cfg?.primeira || t.parcelas[0]?.vencimento || ""} disabled={readOnly}
                  onChange={(e) => setTerc(t.fornecedor, { primeira: e.target.value })} />
                <p className="text-muted-foreground text-xs">
                  {cfg?.primeira ? "Data definida nesta Oferta." : t.inicio ? `Sugerido pelo início da cobrança do serviço (${formatDate(t.inicio)}).` : "Sem início no serviço: segue a 1ª parcela do cliente."}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {t.parcelas.map((p) => (
                <span key={p.numero} className="bg-muted rounded-md px-2 py-1 text-xs tabular-nums">
                  {p.numero}ª {formatDate(p.vencimento)} · {formatBRL(p.valor)}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
