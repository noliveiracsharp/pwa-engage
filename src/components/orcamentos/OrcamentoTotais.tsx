import { tx } from "@/lib/i18n-termos";
import { Calculator, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatBRL, formatPct, type DescontoTipo, type Totais } from "@/lib/orcamentos";
import { cn } from "@/lib/utils";

type Props = {
  /** Esconde a memória de cálculo (dados estratégicos). */
  ocultarCusto?: boolean;
  totais: Totais;
  descontoTipo: DescontoTipo;
  desconto: string;
  frete: string;
  valoresAdicionais: string;
  readOnly?: boolean | undefined;
  itensSemCusto: number;
  /** Acréscimo financeiro do parcelamento com juros (0 quando sem juros). */
  acrescimoJuros?: number;
  /** Desconto da venda à vista (reduz o lucro final). */
  descontoAvista?: number;
  /** Comissões previstas da equipe (reduzem o lucro final). */
  comissoes?: number;
  /** Despesas operacionais internas (alimentação, transporte…). */
  despesas?: number;
  /** "totais" = bloco comercial (aba Oferta); "memoria" = memória de cálculo (aba Financeiro). */
  parte?: "totais" | "memoria";
  /** Itens recorrentes mensais (valores por mês). */
  recorrente?: { receita: number; custo: number; imposto: number; lucro: number };
  vigenciaMeses?: number;
  onChange: (patch: {
    desconto_tipo?: DescontoTipo;
    desconto?: string;
    frete?: string;
    valores_adicionais?: string;
  }) => void;
};

function Linha({
  label,
  value,
  strong,
  className,
}: {
  label: string;
  value: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 text-sm", className)}>
      <span className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={cn("tabular-nums", strong && "font-semibold")}>{value}</span>
    </div>
  );
}

/** Totais comerciais (esquerda) e memória de cálculo interna (direita). */
export function OrcamentoTotais({
  totais,
  descontoTipo,
  desconto,
  frete,
  valoresAdicionais,
  readOnly,
  ocultarCusto = false,
  itensSemCusto,
  acrescimoJuros = 0,
  descontoAvista = 0,
  comissoes = 0,
  despesas = 0,
  parte = "totais",
  recorrente = { receita: 0, custo: 0, imposto: 0, lucro: 0 },
  vigenciaMeses = 36,
  onChange,
}: Props) {
  const temRec = recorrente.receita >= 0.01 || recorrente.custo >= 0.01;
  const meses = Math.max(1, Math.floor(vigenciaMeses || 1));
  const comJuros = acrescimoJuros >= 0.01;
  // Com juros, o cliente paga o acréscimo do parcelamento — ele entra no lucro final.
  const lucroImpl = totais.total_lucro + (comJuros ? acrescimoJuros : 0) - descontoAvista;
  const baseImpl = totais.total_liquido + (comJuros ? acrescimoJuros : 0) - descontoAvista;
  const lucroRecContrato = recorrente.lucro * meses;
  const lucroFinal = lucroImpl + lucroRecContrato - comissoes - despesas;
  const baseFinal = baseImpl + recorrente.receita * meses;
  const margemFinal = baseFinal > 0 ? (lucroFinal / baseFinal) * 100 : 0;
  const prejuizo = lucroFinal < 0 && (totais.total_itens > 0 || temRec);
  const pctDe = (v: number, b: number) => formatPct(b > 0 ? (v / b) * 100 : 0);

  if (parte === "memoria" && ocultarCusto) return null;
  return (
    <div className="space-y-4">
      {/* ---------------- Totais do orçamento ---------------- */}
      {parte === "totais" && <div className="bg-card space-y-3 rounded-lg border p-4">
        <h3 className="text-sm font-semibold">{tx("Totais")}</h3>
        <Linha label={tx("Total da implantação")} value={formatBRL(totais.total_itens)} />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="desconto" className="text-muted-foreground text-sm font-normal">
              Desconto
            </Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={descontoTipo}
              onValueChange={(v) => v && onChange({ desconto_tipo: v as DescontoTipo })}
              disabled={Boolean(readOnly)}
              aria-label={tx("Tipo de desconto")}
            >
              <ToggleGroupItem
                value="valor"
                aria-label={tx("Desconto em reais")}
                className="h-7 px-2.5 text-xs"
              >
                R$
              </ToggleGroupItem>
              <ToggleGroupItem
                value="percentual"
                aria-label={tx("Desconto em percentual")}
                className="h-7 px-2.5 text-xs"
              >
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
            {tx("Frete (R$)")}
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
            {tx("Valores adicionais (R$)")}
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
          <span className="font-semibold">{tx("Total líquido")}</span>
          <span className="text-primary text-xl font-bold tabular-nums">
            {formatBRL(totais.total_liquido)}
          </span>
        </div>
        {temRec && (
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">{tx("Mensalidade")}</span>
            <span className="text-primary text-xl font-bold tabular-nums">{formatBRL(recorrente.receita)}/mês</span>
          </div>
        )}
      </div>}

      {/* ---------------- Memória de cálculo ---------------- */}
      {parte === "memoria" && !ocultarCusto && <div className="bg-muted/30 space-y-3 rounded-lg border border-dashed p-4">
        <div className="flex items-center gap-2">
          <Calculator className="text-muted-foreground h-4 w-4" />
          <h3 className="text-sm font-semibold">{tx("Memória de cálculo")}</h3>
          <span className="text-muted-foreground text-xs">(uso interno)</span>
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">1. Implantação (pontual)</p>
        <Linha label={tx("Venda da implantação")} value={formatBRL(totais.total_itens)} />
        <Linha label={tx("Custo dos itens")} value={formatBRL(totais.total_custo)} />
        <Linha label={tx("Impostos")} value={formatBRL(totais.total_imposto)} />
        <Linha
          label={tx("Lucro dos itens")}
          value={`${formatBRL(totais.lucro_itens)} (${formatPct(
            totais.total_itens > 0 ? (totais.lucro_itens / totais.total_itens) * 100 : 0,
          )})`}
        />
        <Linha label={tx("Desconto concedido")} value={`− ${formatBRL(totais.desconto_valor)}`} />
        {comJuros && (
          <>
            <Separator />
            <Linha
              label={tx("Lucro à vista")}
              value={`${formatBRL(totais.total_lucro)} (${formatPct(totais.margem_pct)})`}
            />
            <Linha
              label={tx("Acréscimo do parcelamento (juros)")}
              value={`+ ${formatBRL(acrescimoJuros)}`}
            />
          </>
        )}
        {descontoAvista >= 0.01 && (
          <Linha label={tx("Desconto à vista")} value={`− ${formatBRL(descontoAvista)}`} />
        )}
        <Linha label={tx("Resultado da implantação")} value={`${formatBRL(lucroImpl)} (${pctDe(lucroImpl, baseImpl)})`} strong />
        {temRec && (
          <>
            <Separator />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">2. Recorrente (mensal)</p>
            <Linha label={tx("Mensalidade")} value={`${formatBRL(recorrente.receita)}/mês`} />
            <Linha label={tx("Custo mensal")} value={`− ${formatBRL(recorrente.custo)}`} />
            <Linha label={tx("Impostos mensais")} value={`− ${formatBRL(recorrente.imposto)}`} />
            <Linha label={tx("Lucro mensal")} value={`${formatBRL(recorrente.lucro)} (${pctDe(recorrente.lucro, recorrente.receita)})`} strong />
            <Linha label={`Lucro no contrato (${meses} meses)`} value={formatBRL(lucroRecContrato)} />
          </>
        )}
        <Separator />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{temRec ? "3. Resultado do contrato" : "2. Resultado final"}</p>
        {comissoes >= 0.01 && (
          <Linha label={tx("Comissões previstas")} value={`− ${formatBRL(comissoes)}`} />
        )}
        {despesas >= 0.01 && (
          <Linha label={tx("Despesas operacionais")} value={`− ${formatBRL(despesas)}`} />
        )}
        <Separator />
        <Linha
          label={temRec ? `Lucro líquido do contrato (${meses} meses)` : comJuros ? "Lucro final (com juros)" : "Lucro líquido"}
          value={`${formatBRL(lucroFinal)} (${formatPct(margemFinal)})`}
          strong
          className={prejuizo ? "text-destructive" : "text-success"}
        />
        <p className="text-muted-foreground text-xs">
          Fórmula por linha: lucro = preço de venda − custo − imposto. O lucro líquido também
          desconta as comissões previstas e as despesas operacionais. Frete e valores adicionais não entram na lucratividade. Itens recorrentes somam o lucro mensal multiplicado pela vigência do contrato.
          {comJuros &&
            " Com juros, o acréscimo do parcelamento (juros + custo operacional embutidos na parcela) soma ao lucro."}
        </p>
        {prejuizo && (
          <p className="text-destructive flex items-center gap-1.5 text-xs font-medium">
            <TriangleAlert className="h-3.5 w-3.5" /> Atenção: com este desconto a oferta fica
            com prejuízo.
          </p>
        )}
        {itensSemCusto > 0 && (
          <p className="text-warning-foreground flex items-center gap-1.5 text-xs">
            <TriangleAlert className="h-3.5 w-3.5" />
            {itensSemCusto === 1
              ? "1 item sem preço de custo cadastrado"
              : `${itensSemCusto} itens sem preço de custo cadastrado`}{" "}
            — o lucro pode estar superestimado.
          </p>
        )}
      </div>}
    </div>
  );
}
