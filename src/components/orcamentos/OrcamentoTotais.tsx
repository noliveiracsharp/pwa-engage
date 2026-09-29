import { Calculator, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatBRL, formatPct, type DescontoTipo, type Totais } from "@/lib/orcamentos";
import { cn } from "@/lib/utils";

type Props = {
  totais: Totais;
  descontoTipo: DescontoTipo;
  desconto: string;
  frete: string;
  valoresAdicionais: string;
  readOnly?: boolean | undefined;
  itensSemCusto: number;
  onChange: (patch: { desconto_tipo?: DescontoTipo; desconto?: string; frete?: string; valores_adicionais?: string }) => void;
};

function Linha({ label, value, strong, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 text-sm", className)}>
      <span className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={cn("tabular-nums", strong && "font-semibold")}>{value}</span>
    </div>
  );
}

/** Totais comerciais (esquerda) e memória de cálculo interna (direita). */
export function OrcamentoTotais({ totais, descontoTipo, desconto, frete, valoresAdicionais, readOnly, itensSemCusto, onChange }: Props) {
  const prejuizo = totais.total_lucro < 0 && totais.total_itens > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ---------------- Totais do orçamento ---------------- */}
      <div className="bg-card space-y-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">Totais</h3>
        <Linha label="Total dos itens" value={formatBRL(totais.total_itens)} />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="desconto" className="text-muted-foreground text-sm font-normal">
              Desconto
            </Label>
            <ToggleGroup
              type="single"
              size="sm"
              value={descontoTipo}
              onValueChange={(v) => v && onChange({ desconto_tipo: v as DescontoTipo })}
              disabled={Boolean(readOnly)}
              aria-label="Tipo de desconto"
            >
              <ToggleGroupItem value="valor" aria-label="Desconto em reais" className="h-7 px-2.5 text-xs">
                R$
              </ToggleGroupItem>
              <ToggleGroupItem value="percentual" aria-label="Desconto em percentual" className="h-7 px-2.5 text-xs">
                %
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex items-center gap-2">
            <Input
              id="desconto"
              type="number"
              inputMode="decimal"
              min={0}
              max={descontoTipo === "percentual" ? 100 : undefined}
              step="0.01"
              value={desconto}
              placeholder={descontoTipo === "percentual" ? "0 %" : "0,00"}
              onChange={(e) => onChange({ desconto: e.target.value })}
            />
            <span className="text-muted-foreground w-32 shrink-0 text-right text-sm tabular-nums">
              − {formatBRL(totais.desconto_valor)}
              {descontoTipo === "valor" && totais.desconto_pct > 0 && (
                <span className="ml-1 text-xs">({formatPct(totais.desconto_pct)})</span>
              )}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="frete" className="text-muted-foreground text-sm font-normal">
            Frete (R$)
          </Label>
          <Input
            id="frete"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={frete}
            placeholder="0,00"
            onChange={(e) => onChange({ frete: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="valores_adicionais" className="text-muted-foreground text-sm font-normal">
            Valores adicionais (R$)
          </Label>
          <Input
            id="valores_adicionais"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={valoresAdicionais}
            placeholder="0,00"
            onChange={(e) => onChange({ valores_adicionais: e.target.value })}
          />
        </div>

        <Separator />
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">Total líquido</span>
          <span className="text-primary text-xl font-bold tabular-nums">{formatBRL(totais.total_liquido)}</span>
        </div>
      </div>

      {/* ---------------- Memória de cálculo ---------------- */}
      <div className="bg-muted/30 space-y-3 rounded-lg border border-dashed p-4">
        <div className="flex items-center gap-2">
          <Calculator className="text-muted-foreground h-4 w-4" />
          <h3 className="text-sm font-semibold">Memória de cálculo</h3>
          <span className="text-muted-foreground text-xs">(uso interno)</span>
        </div>
        <Linha label="Custo dos itens" value={formatBRL(totais.total_custo)} />
        <Linha label="Impostos" value={formatBRL(totais.total_imposto)} />
        <Linha
          label="Lucro dos itens"
          value={`${formatBRL(totais.lucro_itens)} (${formatPct(
            totais.total_itens > 0 ? (totais.lucro_itens / totais.total_itens) * 100 : 0,
          )})`}
        />
        <Linha label="Desconto concedido" value={`− ${formatBRL(totais.desconto_valor)}`} />
        <Separator />
        <Linha
          label="Lucro líquido"
          value={`${formatBRL(totais.total_lucro)} (${formatPct(totais.margem_pct)})`}
          strong
          className={prejuizo ? "text-destructive" : "text-success"}
        />
        <p className="text-muted-foreground text-xs">
          Fórmula por linha: lucro = preço de venda − custo − imposto. Frete e valores adicionais não entram na lucratividade.
        </p>
        {prejuizo && (
          <p className="text-destructive flex items-center gap-1.5 text-xs font-medium">
            <TriangleAlert className="h-3.5 w-3.5" /> Atenção: com este desconto o orçamento fica com prejuízo.
          </p>
        )}
        {itensSemCusto > 0 && (
          <p className="text-warning-foreground flex items-center gap-1.5 text-xs">
            <TriangleAlert className="h-3.5 w-3.5" />
            {itensSemCusto === 1 ? "1 item sem preço de custo cadastrado" : `${itensSemCusto} itens sem preço de custo cadastrado`} — o
            lucro pode estar superestimado.
          </p>
        )}
      </div>
    </div>
  );
}
