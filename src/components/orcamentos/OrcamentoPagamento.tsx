import { tx } from "@/lib/i18n-termos";
import { useEffect, useState } from "react";
import { CalendarClock, ReceiptText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { num } from "@/lib/orcamentos";
import { useAudit } from "@/lib/audit";
import type { ParcelaServico } from "@/lib/oferta-cronogramas";
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

/** Parâmetros financeiros da empresa (empresas_configuracao). */
type ConfigComercial = {
  taxa_juros_mensal: number;
  custo_operacional_mensal: number;
  fator_markup: number;
};

/**
 * Cálculo financeiro composto do parcelamento:
 *  1. coeficiente da Tabela Price com a taxa mensal da empresa;
 *  2. parcela-base = total líquido × coeficiente Price;
 *  3. embute o custo operacional fixo e aplica o fator de markup;
 *  4. coeficiente global = parcela final / total líquido (exibido em tela).
 */
function calcularParcelamentoComJuros(
  totalLiquidoBase: number,
  parcelas: number,
  config: ConfigComercial | null,
): { parcelaFinal: number; coeficienteGlobal: number } {
  if (!config || parcelas <= 0 || totalLiquidoBase <= 0) {
    return { parcelaFinal: 0, coeficienteGlobal: 0 };
  }

  // Conversão de segurança para números
  const i = Number(config.taxa_juros_mensal); // Ex: 0.015
  const custo = Number(config.custo_operacional_mensal); // Ex: 400
  const markup = Number(config.fator_markup); // Ex: 0.65

  // 1. Coeficiente da Tabela Price
  const coefPrice = i / (1 - Math.pow(1 + i, -parcelas));

  // 2. Valor da parcela apenas com os juros (Base)
  const parcelaBase = totalLiquidoBase * coefPrice;

  // 3. Embutindo o custo operacional e aplicando a margem (Markup)
  const parcelaFinal = (parcelaBase + custo) / markup;

  // 4. Coeficiente Global gerado (para exibição em tela)
  const coeficienteGlobal = parcelaFinal / totalLiquidoBase;

  if (!Number.isFinite(parcelaFinal) || !Number.isFinite(coeficienteGlobal)) {
    return { parcelaFinal: 0, coeficienteGlobal: 0 };
  }

  return { parcelaFinal: parcelaFinal, coeficienteGlobal: coeficienteGlobal };
}

/** Coeficiente em texto (7 casas, separador decimal brasileiro). */
const fmtCoef = (v: number) => v.toFixed(7).replace(".", ",");

/** Percentual legível (0.015 → "1,5"). */
const fmtPct = (v: number) =>
  (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export type PagamentoState = {
  obs_nota_fiscal: string;
  forma_pagamento: string;
  forma_pagamento_obs: string;
  qtd_parcelas: string;
  tem_juros: boolean;
  coeficiente_juros: string;
  primeira_parcela: string;
  /** Entrada na 1ª parcela: percentual do total ou valor em R$. */
  entrada_tipo: "percentual" | "valor";
  entrada: string;
  /** Valores digitados à mão no cronograma (número da parcela → R$). */
  fixas: Record<number, number>;
  /** Vencimentos alterados à mão (número da parcela → yyyy-mm-dd). */
  datas: Record<number, string>;
  /** Parâmetros próprios desta oferta (vazio = usa o padrão da empresa). Taxa e markup em %. */
  juros_oferta?: string;
  custo_oferta?: string;
  markup_oferta?: string;
};

type Props = {
  value: PagamentoState;
  parcelas: Parcela[];
  /** Serviços avulsos com início próprio: cronograma de recebimento separado. */
  parcelasServicos?: ParcelaServico[];
  totalLiquido: number;
  /** Entrada já calculada em R$ (0 quando não há). */
  entradaValor?: number;
  modalidade?: "avista" | "prazo" | "comodato";
  readOnly?: boolean | undefined;
  onChange: (patch: Partial<PagamentoState>) => void;
};

/** Observações fiscais, forma de pagamento e geração automática das parcelas. */
export function OrcamentoPagamento({ value, parcelas, parcelasServicos = [], totalLiquido, entradaValor = 0, modalidade = "prazo", readOnly, onChange }: Props) {
  const avista = modalidade === "avista";
  const comodato = modalidade === "comodato";
  const total = somaParcelas(parcelas);
  const acrescimo = total - totalLiquido;

  const qtdParcelas = Math.max(0, Math.floor(num(value.qtd_parcelas)));

  // Parâmetros comerciais da empresa (taxa de juros, custo operacional, markup).
  const [configComercial, setConfigComercial] = useState<ConfigComercial | null>(null);
  const { empresaId } = useAudit();
  useEffect(() => {
    let ativo = true;
    supabase
      .from("empresas_configuracao")
      .select("*")
      .then(({ data }) => {
        if (!ativo || !data) return;
        const rows = (data as Record<string, unknown>[]).filter((r) => r["ativo"] !== false);
        const row =
          rows.find((r) => empresaId !== undefined && String(r["empresa_id"] ?? "") === String(empresaId)) ??
          rows.find((r) => r["empresa_id"] == null) ??
          rows[0];
        if (!row) return;
        // Aceita taxa/markup em decimal (0,015 / 0,65) ou percentual (1,5 / 65).
        const taxa = num(row["taxa_juros_mensal"]);
        const markup = num(row["fator_markup"]);
        setConfigComercial({
          taxa_juros_mensal: taxa > 1 ? taxa / 100 : taxa,
          custo_operacional_mensal: num(row["custo_operacional_mensal"]),
          fator_markup: markup > 1 ? markup / 100 : markup,
        });
      });
    return () => {
      ativo = false;
    };
  }, [empresaId]);

  // Recalcula o coeficiente global sempre que o total líquido, a quantidade de
  // parcelas ou o toggle "Com juros" mudarem. Preenche e trava o campo quando
  // "Com juros"; limpa quando volta para "Sem juros" (divisão simples).
  const preenchido = (s?: string) => (s ?? "").trim() !== "";
  const configEfetiva: ConfigComercial | null = configComercial || preenchido(value.juros_oferta) || preenchido(value.custo_oferta) || preenchido(value.markup_oferta)
    ? {
        taxa_juros_mensal: preenchido(value.juros_oferta) ? num(value.juros_oferta) / 100 : (configComercial?.taxa_juros_mensal ?? 0),
        custo_operacional_mensal: preenchido(value.custo_oferta) ? num(value.custo_oferta) : (configComercial?.custo_operacional_mensal ?? 0),
        fator_markup: preenchido(value.markup_oferta) ? num(value.markup_oferta) / 100 : (configComercial?.fator_markup ?? 0),
      }
    : null;
  const { parcelaFinal, coeficienteGlobal } = calcularParcelamentoComJuros(
    totalLiquido - entradaValor,
    entradaValor > 0 ? qtdParcelas - 1 : qtdParcelas,
    configEfetiva,
  );
  useEffect(() => {
    if (value.tem_juros) {
      if (coeficienteGlobal <= 0) return;
      const texto = fmtCoef(coeficienteGlobal);
      if (value.coeficiente_juros !== texto) onChange({ coeficiente_juros: texto });
    } else if (value.coeficiente_juros) {
      onChange({ coeficiente_juros: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.tem_juros, qtdParcelas, totalLiquido, entradaValor, coeficienteGlobal]);

  const temFixas = Object.keys(value.fixas ?? {}).length > 0;
  const fixarParcela = (numero: number, texto: string) => {
    const fixas = { ...(value.fixas ?? {}) };
    if (texto.trim() === "") delete fixas[numero];
    else fixas[numero] = num(texto);
    onChange({ fixas });
  };

  // Configuração completa o suficiente para o cálculo (markup precisa ser > 0).
  const cfg =
    configEfetiva && configEfetiva.fator_markup > 0 && configEfetiva.taxa_juros_mensal >= 0
      ? configEfetiva
      : null;

  return (
    <div className="space-y-4">
      {/* ------------------ observações da nota fiscal ------------------ */}
      <div className="bg-card space-y-3 rounded-lg border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ReceiptText className="text-muted-foreground h-4 w-4" />
          {tx("Observações complementares da nota fiscal")}
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
          placeholder={tx("Ex.: Serviço prestado conforme contrato nº 123/2026. Retenções aplicáveis…")}
          onChange={(e) => onChange({ obs_nota_fiscal: e.target.value })}
        />
      </div>

      {/* ---------------------- forma de pagamento ---------------------- */}
      <div className="bg-card space-y-4 rounded-lg border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="text-muted-foreground h-4 w-4" />
          {tx("Condições de pagamento")}
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
                <SelectValue placeholder={tx("Selecione")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{tx("Não informada")}</SelectItem>
                {FORMAS_PAGAMENTO.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!avista && (<div className="min-w-0 space-y-1.5">
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
          </div>)}

          {!avista && (<div className="min-w-0 space-y-1.5">
            <Label className="block text-sm font-medium">{tx("Juros")}</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              className="w-full"
              value={value.tem_juros ? "com" : "sem"}
              onValueChange={(v) => {
                if (!v) return;
                if (v === "com") {
                  onChange({
                    tem_juros: true,
                    coeficiente_juros: coeficienteGlobal > 0 ? fmtCoef(coeficienteGlobal) : "",
                  });
                } else {
                  onChange({ tem_juros: false, coeficiente_juros: "" });
                }
              }}
              disabled={Boolean(readOnly) || comodato}
            >
              <ToggleGroupItem value="sem" className="flex-1">
                {tx("Sem juros")}
              </ToggleGroupItem>
              <ToggleGroupItem value="com" className="flex-1">
                {tx("Com juros")}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>)}

          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="primeira_parcela" className="block text-sm font-medium">
              {avista ? "Vencimento" : "1ª parcela"}
            </Label>
            <Input
              id="primeira_parcela"
              type="date"
              value={value.primeira_parcela}
              onChange={(e) => onChange({ primeira_parcela: e.target.value })}
            />
          </div>

          {!avista && qtdParcelas >= 2 && (
            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <Label htmlFor="entrada" className="block text-sm font-medium">
                {tx("Entrada (1ª parcela)")}
              </Label>
              <div className="flex gap-2">
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={value.entrada_tipo}
                  onValueChange={(v) => v && onChange({ entrada_tipo: v as "percentual" | "valor" })}
                  disabled={Boolean(readOnly)}
                >
                  <ToggleGroupItem value="percentual" className="px-3">%</ToggleGroupItem>
                  <ToggleGroupItem value="valor" className="px-3">R$</ToggleGroupItem>
                </ToggleGroup>
                <Input
                  id="entrada"
                  inputMode="decimal"
                  placeholder={value.entrada_tipo === "percentual" ? "Ex.: 40" : "Ex.: 4.000,00"}
                  value={value.entrada}
                  onChange={(e) => onChange({ entrada: e.target.value })}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                {entradaValor > 0
                  ? `Entrada de ${formatBRL(entradaValor)}; o saldo de ${formatBRL(totalLiquido - entradaValor)} é dividido nas ${qtdParcelas - 1} parcelas seguintes${value.tem_juros ? " (juros só sobre o saldo)" : ""}.`
                  : "Deixe em branco para dividir o total em parcelas iguais."}
              </p>
            </div>
          )}

          {!avista && value.tem_juros && (
            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <Label htmlFor="coeficiente_juros" className="block text-sm font-medium">
                {tx("Coeficiente da parcela")}
              </Label>
              <Input
                id="coeficiente_juros"
                inputMode="decimal"
                placeholder={tx("Calculado automaticamente")}
                value={value.coeficiente_juros}
                readOnly
                disabled
                className="bg-muted/50"
              />
              <p className="text-muted-foreground text-xs">
                {cfg
                  ? `Calculado com taxa de ${fmtPct(cfg.taxa_juros_mensal)}% a.m. (Tabela Price), custo operacional de ${formatBRL(cfg.custo_operacional_mensal)} e markup de ${fmtPct(cfg.fator_markup)}%. Valor da parcela = total líquido × coeficiente.`
                  : "Cadastre taxa de juros, custo operacional e fator de markup nas configurações da empresa para calcular automaticamente."}
              </p>
            </div>
          )}

          {!avista && value.tem_juros && (
            <div className="grid gap-3 sm:col-span-2 lg:col-span-4 sm:grid-cols-3">
              {([
                ["juros_oferta", "Taxa de juros (% a.m.)", configComercial ? fmtPct(configComercial.taxa_juros_mensal) : ""],
                ["custo_oferta", "Custo operacional (R$)", configComercial ? String(configComercial.custo_operacional_mensal).replace(".", ",") : ""],
                ["markup_oferta", "Markup (%)", configComercial ? fmtPct(configComercial.fator_markup) : ""],
              ] as const).map(([campo, rotulo, padrao]) => (
                <div key={campo} className="min-w-0 space-y-1.5">
                  <Label htmlFor={campo} className="block text-sm font-medium">{rotulo}</Label>
                  <Input
                    id={campo}
                    inputMode="decimal"
                    disabled={Boolean(readOnly)}
                    value={value[campo] ?? ""}
                    placeholder={padrao ? `Padrão: ${padrao}` : "Padrão da empresa"}
                    onChange={(e) => onChange({ [campo]: e.target.value })}
                  />
                  <p className="text-muted-foreground text-xs">
                    {(value[campo] ?? "").trim() ? "Valor desta oferta" : `Usando o padrão da empresa${padrao ? ` (${padrao})` : ""}`}
                  </p>
                </div>
              ))}
            </div>
          )}

          {!avista && value.tem_juros && cfg && parcelaFinal > 0 && (
            <div className="bg-muted/30 space-y-1 rounded-md border p-3 text-xs sm:col-span-2 lg:col-span-4">
              <p className="text-muted-foreground font-medium">
                {tx("Memória de cálculo do parcelamento")}
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Taxa {fmtPct(cfg.taxa_juros_mensal)}% a.m. · custo operacional{" "}
                {formatBRL(cfg.custo_operacional_mensal)} · markup {fmtPct(cfg.fator_markup)}% ·
                coeficiente global {coeficienteGlobal.toFixed(7)} → parcela de{" "}
                <span className="text-foreground font-semibold tabular-nums">
                  {formatBRL(parcelaFinal)}
                </span>{" "}
                × {qtdParcelas}.
              </p>
            </div>
          )}

          <div className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-4">
            <Label htmlFor="forma_pagamento_obs" className="block text-sm font-medium">
              {tx("Observações do pagamento")}
            </Label>
            <Textarea
              id="forma_pagamento_obs"
              rows={2}
              value={value.forma_pagamento_obs}
              placeholder={tx("Ex.: 50% na assinatura e 50% na entrega. Pix chave CNPJ…")}
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
                  <th className="px-3 py-2 text-left font-medium">{tx("Parcela")}</th>
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
                    <td className="px-3 py-2 tabular-nums">
                      {readOnly ? (
                        formatDate(p.vencimento)
                      ) : (
                        <Input
                          type="date"
                          aria-label={`Vencimento da parcela ${p.numero}`}
                          className={`h-8 w-40 tabular-nums ${value.datas?.[p.numero] ? "border-primary" : ""}`}
                          value={p.vencimento}
                          onChange={(e) => {
                            const datas = { ...(value.datas ?? {}) };
                            if (e.target.value) datas[p.numero] = e.target.value;
                            else delete datas[p.numero];
                            onChange({ datas });
                          }}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {readOnly || avista || parcelas.length < 2 || (entradaValor > 0 && p.numero === 1) ? (
                        formatBRL(p.valor)
                      ) : (
                        <Input
                          key={`${p.numero}-${p.valor}`}
                          inputMode="decimal"
                          aria-label={`Valor da parcela ${p.numero}`}
                          defaultValue={p.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          className={`ml-auto h-8 w-32 text-right tabular-nums ${value.fixas?.[p.numero] !== undefined ? "border-primary" : ""}`}
                          onBlur={(e) => {
                            const novo = num(e.target.value);
                            if (Math.abs(novo - p.valor) >= 0.01) fixarParcela(p.numero, e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 border-t font-semibold">
                  <td className="px-3 py-2" colSpan={2}>
                    {tx("Total parcelado")}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatBRL(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            {tx("Informe a data da 1ª parcela e adicione itens para gerar o cronograma automaticamente.")}
          </p>
        )}

        {parcelasServicos.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Serviços avulsos — cobrança separada</p>
            <p className="text-muted-foreground text-xs">Estes serviços têm início de cobrança próprio e não entram no parcelamento acima.</p>
            <div className="overflow-hidden rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Serviço</th>
                    <th className="px-3 py-2 text-left font-medium">{tx("Parcela")}</th>
                    <th className="px-3 py-2 text-left font-medium">Vencimento</th>
                    <th className="px-3 py-2 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {parcelasServicos.map((p) => (
                    <tr key={`${p.linha}-${p.numero}`} className="border-t">
                      <td className="px-3 py-2">{p.descricao}</td>
                      <td className="px-3 py-2 tabular-nums">{p.numero}/{p.total_parcelas}</td>
                      <td className="px-3 py-2 tabular-nums">{formatDate(p.vencimento)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatBRL(p.valor)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/30 border-t font-semibold">
                    <td className="px-3 py-2" colSpan={3}>Total dos serviços separados</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBRL(somaParcelas(parcelasServicos))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {!avista && parcelas.length >= 2 && !readOnly && (
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <span>{tx("Altere o valor ou a data de qualquer parcela: o saldo é rateado automaticamente nas demais.")}</span>
            {Object.keys(value.datas ?? {}).length > 0 && (
              <button type="button" className="text-primary underline underline-offset-2" onClick={() => onChange({ datas: {} })}>
                {tx("Restaurar datas mensais")}
              </button>
            )}
            {temFixas && (
              <button
                type="button"
                className="text-primary underline underline-offset-2"
                onClick={() => onChange({ fixas: {} })}
              >
                {tx("Recalcular parcelas iguais")}
              </button>
            )}
          </div>
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
