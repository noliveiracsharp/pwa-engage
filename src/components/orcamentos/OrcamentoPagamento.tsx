import { useEffect, useRef, useState } from "react";
import { CalendarClock, ReceiptText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { num } from "@/lib/orcamentos";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  formatBRL,
  formatDate,
  FORMAS_PAGAMENTO,
  somaParcelas,
  type Parcela,
} from "@/lib/orcamentos";

const NONE = "__none__";

export type PagamentoState = {
  obs_nota_fiscal: string;
  forma_pagamento: string;
  forma_pagamento_obs: string;
  qtd_parcelas: string;
  tem_juros: boolean;
  coeficiente_juros: string;
  primeira_parcela: string;
};

type Props = {
  value: PagamentoState;
  parcelas: Parcela[];
  totalLiquido: number;
  readOnly?: boolean | undefined;
  onChange: (patch: Partial<PagamentoState>) => void;
};

/** Observações fiscais, forma de pagamento e geração automática das parcelas. */
export function OrcamentoPagamento({ value, parcelas, totalLiquido, readOnly, onChange }: Props) {
  const total = somaParcelas(parcelas);
  const acrescimo = total - totalLiquido;

  // Taxa de juros mensal da empresa (empresas_configuracao.taxa_juros_mensal).
  const [taxaJuros, setTaxaJuros] = useState<number>(0);
  useEffect(() => {
    let ativo = true;
    supabase
      .from("empresas_configuracao")
      .select("taxa_juros_mensal")
      .eq("ativo", true)
      .single()
      .then(({ data }) => {
        if (ativo) setTaxaJuros(num(data?.taxa_juros_mensal));
      });
    return () => {
      ativo = false;
    };
  }, []);

  // Tabela Price: coeficiente = i / (1 - (1 + i)^-n). Preenche e trava o campo
  // quando "Com juros"; limpa quando volta para "Sem juros".
  const ultimoAuto = useRef("");
  useEffect(() => {
    const n = Math.max(0, Math.floor(num(value.qtd_parcelas)));
    if (value.tem_juros && n > 0 && taxaJuros > 0) {
      const coef = taxaJuros / (1 - Math.pow(1 + taxaJuros, -n));
      const texto = coef.toFixed(7).replace(".", ",");
      ultimoAuto.current = texto;
      if (value.coeficiente_juros !== texto) onChange({ coeficiente_juros: texto });
    } else if (!value.tem_juros && value.coeficiente_juros) {
      // Limpa apenas se o valor atual era o automático (ou sempre que voltar a "Sem juros").
      ultimoAuto.current = "";
      onChange({ coeficiente_juros: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.tem_juros, value.qtd_parcelas, taxaJuros]);

  return (
    <div className="space-y-4">
      {/* ------------------ observações da nota fiscal ------------------ */}
      <div className="bg-card space-y-3 rounded-lg border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ReceiptText className="text-muted-foreground h-4 w-4" />
          Observações complementares da nota fiscal
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Inclua informações relevantes para seu cliente. Elas aparecerão na nota fiscal, nos campos
          “Descrição do serviço” ou “Informações Complementares Contribuinte”, visíveis no XML, PDF
          e DANFE.
        </p>
        <Textarea
          id="obs_nota_fiscal"
          rows={3}
          value={value.obs_nota_fiscal}
          placeholder="Ex.: Serviço prestado conforme contrato nº 123/2026. Retenções aplicáveis…"
          onChange={(e) => onChange({ obs_nota_fiscal: e.target.value })}
        />
      </div>

      {/* ---------------------- forma de pagamento ---------------------- */}
      <div className="bg-card space-y-4 rounded-lg border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="text-muted-foreground h-4 w-4" />
          Condições de pagamento
        </div>

        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="forma_pagamento" className="block text-sm font-medium">
              Forma de pagamento
            </Label>
            <Select
              value={value.forma_pagamento || NONE}
              onValueChange={(v) => onChange({ forma_pagamento: v === NONE ? "" : v })}
              disabled={Boolean(readOnly)}
            >
              <SelectTrigger id="forma_pagamento">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não informada</SelectItem>
                {FORMAS_PAGAMENTO.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="qtd_parcelas" className="block text-sm font-medium">
              Parcelas
            </Label>
            <Input
              id="qtd_parcelas"
              type="number"
              min={1}
              max={60}
              inputMode="numeric"
              value={value.qtd_parcelas}
              onChange={(e) => onChange({ qtd_parcelas: e.target.value })}
            />
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label className="block text-sm font-medium">Juros</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              className="w-full"
              value={value.tem_juros ? "com" : "sem"}
              onValueChange={(v) => {
                if (v) onChange({ tem_juros: v === "com" });
              }}
              disabled={Boolean(readOnly)}
            >
              <ToggleGroupItem value="sem" className="flex-1">
                Sem juros
              </ToggleGroupItem>
              <ToggleGroupItem value="com" className="flex-1">
                Com juros
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="primeira_parcela" className="block text-sm font-medium">
              1ª parcela
            </Label>
            <Input
              id="primeira_parcela"
              type="date"
              value={value.primeira_parcela}
              onChange={(e) => onChange({ primeira_parcela: e.target.value })}
            />
          </div>

          {value.tem_juros && (
            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <Label htmlFor="coeficiente_juros" className="block text-sm font-medium">
                Coeficiente da parcela
              </Label>
              <Input
                id="coeficiente_juros"
                inputMode="decimal"
                placeholder="Calculado automaticamente"
                value={value.coeficiente_juros}
                readOnly
                disabled
                className="bg-muted/50"
              />
              <p className="text-muted-foreground text-xs">
                {taxaJuros > 0
                  ? `Calculado pela Tabela Price com a taxa da empresa (${(taxaJuros * 100).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}% a.m.). Valor da parcela = total líquido × coeficiente.`
                  : "Cadastre a taxa de juros mensal nas configurações da empresa para calcular automaticamente."}
              </p>
            </div>
          )}

          <div className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-4">
            <Label htmlFor="forma_pagamento_obs" className="block text-sm font-medium">
              Observações do pagamento
            </Label>
            <Textarea
              id="forma_pagamento_obs"
              rows={2}
              value={value.forma_pagamento_obs}
              placeholder="Ex.: 50% na assinatura e 50% na entrega. Pix chave CNPJ…"
              onChange={(e) => onChange({ forma_pagamento_obs: e.target.value })}
            />
          </div>
        </div>

        {/* ------------------------- cronograma ------------------------- */}
        {parcelas.length > 0 ? (
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Parcela</th>
                  <th className="px-3 py-2 text-left font-medium">Vencimento</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {parcelas.map((p) => (
                  <tr key={p.numero} className="border-t">
                    <td className="px-3 py-2 tabular-nums">
                      {p.numero}/{parcelas.length}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatDate(p.vencimento)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBRL(p.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 border-t font-semibold">
                  <td className="px-3 py-2" colSpan={2}>
                    Total parcelado
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatBRL(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            Informe a data da 1ª parcela e adicione itens para gerar o cronograma automaticamente.
          </p>
        )}

        {parcelas.length > 0 && Math.abs(acrescimo) >= 0.01 && (
          <p className="text-warning-foreground text-xs">
            Acréscimo de {formatBRL(acrescimo)} sobre o total líquido de {formatBRL(totalLiquido)}.
          </p>
        )}
      </div>
    </div>
  );
}
