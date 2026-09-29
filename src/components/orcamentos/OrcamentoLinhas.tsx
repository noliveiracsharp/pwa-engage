import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchSelect, type SearchOption } from "@/components/data-table/SearchSelect";
import { calcLinha, formatBRL, formatPct, type Linha } from "@/lib/orcamentos";
import { cn } from "@/lib/utils";

const NONE = "__none__";

type Props = {
  linhas: Linha[];
  itemOptions: SearchOption[];
  unidadeOptions: Array<{ value: string; label: string }>;
  readOnly?: boolean | undefined;
  onChange: (key: string, patch: Partial<Linha>) => void;
  onSelectItem: (key: string, itemId: string) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
};

/** Editor das linhas do orçamento com a memória de cálculo por linha. */
export function OrcamentoLinhas({
  linhas,
  itemOptions,
  unidadeOptions,
  readOnly,
  onChange,
  onSelectItem,
  onAdd,
  onRemove,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Itens do orçamento</h3>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={onAdd}>
            <Plus className="mr-1 h-4 w-4" /> Adicionar item
          </Button>
        )}
      </div>

      {linhas.length === 0 && (
        <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          Nenhum item adicionado. {readOnly ? "" : 'Clique em "Adicionar item" para começar.'}
        </div>
      )}

      {linhas.map((l, index) => {
        const c = calcLinha(l);
        const semCusto = l.item_id !== "" && l.preco_custo <= 0;
        return (
          <div key={l.key} className="bg-card space-y-3 rounded-lg border p-3">
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground mt-2.5 w-5 shrink-0 text-right text-xs tabular-nums">
                {index + 1}.
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor={`item-${l.key}`} className="block text-xs font-medium">
                  Item (produto ou serviço)
                </Label>
                <SearchSelect
                  id={`item-${l.key}`}
                  value={l.item_id}
                  onChange={(id) => onSelectItem(l.key, id)}
                  options={itemOptions}
                  placeholder="Selecione o item"
                  searchPlaceholder="Código ou descrição…"
                  emptyText="Nenhum item ativo encontrado."
                  disabled={Boolean(readOnly)}
                />
              </div>
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-6 shrink-0"
                  aria-label="Remover item"
                  title="Remover item"
                  onClick={() => onRemove(l.key)}
                >
                  <Trash2 className="text-destructive h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pl-7 sm:grid-cols-12">
              <div className="col-span-2 space-y-1.5 sm:col-span-4">
                <Label htmlFor={`detalhe-${l.key}`} className="block text-xs font-medium">
                  Detalhe
                </Label>
                <Input
                  id={`detalhe-${l.key}`}
                  value={l.detalhe}
                  placeholder="Observação da linha"
                  onChange={(e) => onChange(l.key, { detalhe: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`qtd-${l.key}`} className="block text-xs font-medium">
                  Quantidade
                </Label>
                <Input
                  id={`qtd-${l.key}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.001"
                  value={l.quantidade}
                  onChange={(e) => onChange(l.key, { quantidade: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`unid-${l.key}`} className="block text-xs font-medium">
                  Unidade
                </Label>
                <Select
                  value={l.unidade_medida_id || NONE}
                  onValueChange={(v) => onChange(l.key, { unidade_medida_id: v === NONE ? "" : v })}
                  disabled={Boolean(readOnly)}
                >
                  <SelectTrigger id={`unid-${l.key}`}>
                    <SelectValue placeholder="Unid." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {unidadeOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`vu-${l.key}`} className="block text-xs font-medium">
                  Unitário (R$)
                </Label>
                <Input
                  id={`vu-${l.key}`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={l.valor_unitario}
                  onChange={(e) => onChange(l.key, { valor_unitario: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="block text-xs font-medium">Total da linha</Label>
                <div className="bg-muted/50 flex h-10 items-center justify-end rounded-md border px-3 text-sm font-semibold tabular-nums">
                  {formatBRL(c.total_linha)}
                </div>
              </div>
            </div>

            <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 pl-7 text-xs">
              <span>
                Custo:{" "}
                <strong className="text-foreground font-medium">{formatBRL(c.custo_total)}</strong>
                {l.preco_custo > 0 && <span className="ml-1">({formatBRL(l.preco_custo)}/un)</span>}
              </span>
              <span>
                Imposto ({formatPct(l.imposto_pct)}):{" "}
                <strong className="text-foreground font-medium">
                  {formatBRL(c.imposto_valor)}
                </strong>
              </span>
              <span>
                Lucro:{" "}
                <strong
                  className={cn("font-medium", c.lucro < 0 ? "text-destructive" : "text-success")}
                >
                  {formatBRL(c.lucro)}
                </strong>{" "}
                <span className={cn(c.lucro < 0 ? "text-destructive" : "")}>
                  ({formatPct(c.margem_pct)})
                </span>
              </span>
              {semCusto && (
                <span className="text-warning-foreground bg-warning/40 rounded px-1.5">
                  Item sem custo cadastrado
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
