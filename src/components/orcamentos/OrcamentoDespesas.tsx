import { Plus, Receipt, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CATEGORIAS_DESPESA,
  formatBRL,
  novaDespesa,
  totalDespesas,
  type CategoriaDespesa,
  type DespesaOperacional,
} from "@/lib/orcamentos";

type Props = {
  despesas: DespesaOperacional[];
  readOnly?: boolean | undefined;
  onChange: (despesas: DespesaOperacional[]) => void;
};

/** Despesas operacionais internas (não cobradas do cliente) que reduzem o lucro da Oferta. */
export function OrcamentoDespesas({ despesas, readOnly, onChange }: Props) {
  const total = totalDespesas(despesas);
  const update = (key: string, patch: Partial<DespesaOperacional>) =>
    onChange(despesas.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  return (
    <div className="bg-card space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Receipt className="text-muted-foreground h-4 w-4" />
          <h3 className="text-sm font-semibold">Despesas operacionais</h3>
          <span className="text-muted-foreground text-xs">(uso interno, reduzem o lucro)</span>
        </div>
        {!readOnly && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange([...despesas, novaDespesa()])}
          >
            <Plus className="h-4 w-4" /> Adicionar despesa
          </Button>
        )}
      </div>

      {despesas.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhuma despesa. Inclua alimentação, transporte, hospedagem, locações ou taxas previstas
          para executar o projeto.
        </p>
      ) : (
        <div className="space-y-2">
          {despesas.map((d) => (
            <div key={d.key} className="grid gap-2 sm:grid-cols-[220px_1fr_140px_auto]">
              <Select
                value={d.categoria}
                onValueChange={(v) => update(d.key, { categoria: v as CategoriaDespesa })}
                disabled={Boolean(readOnly)}
              >
                <SelectTrigger aria-label="Categoria">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_DESPESA.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder={d.categoria === "outros" ? "Descreva a despesa" : "Detalhe (opcional)"}
                value={d.descricao}
                readOnly={Boolean(readOnly)}
                onChange={(e) => update(d.key, { descricao: e.target.value })}
              />
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                placeholder="0,00"
                aria-label="Valor (R$)"
                value={d.valor}
                readOnly={Boolean(readOnly)}
                onChange={(e) => update(d.key, { valor: e.target.value })}
              />
              {!readOnly && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remover despesa"
                  onClick={() => onChange(despesas.filter((x) => x.key !== d.key))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <div className="flex justify-end gap-3 pt-1 text-sm">
            <span className="text-muted-foreground">Total das despesas</span>
            <span className="font-semibold tabular-nums">{formatBRL(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
