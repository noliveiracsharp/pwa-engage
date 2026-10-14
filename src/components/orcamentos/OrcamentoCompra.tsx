import { Truck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  COMPRA_MODOS,
  formatBRL,
  formatDateBR,
  type CompraModo,
  type CondicaoCompra,
  type Parcela,
} from "@/lib/orcamentos";

type Props = {
  value: CondicaoCompra;
  custo: number;
  cronograma: Parcela[];
  readOnly?: boolean | undefined;
  onChange: (c: CondicaoCompra) => void;
};

/** Como o custo dos itens será pago ao fornecedor (alimenta o fluxo de caixa projetado). */
export function OrcamentoCompra({ value, custo, cronograma, readOnly, onChange }: Props) {
  const set = (patch: Partial<CondicaoCompra>) => onChange({ ...value, ...patch });
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
        disabled={readOnly}
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
              {p.numero}ª {formatDateBR(p.vencimento)} · {formatBRL(p.valor)}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">Sem custo de itens para programar.</p>
      )}
    </div>
  );
}
