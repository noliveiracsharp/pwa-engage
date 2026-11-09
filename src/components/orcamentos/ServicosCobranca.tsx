import { CalendarClock } from "lucide-react";
import { FORMAS_PAGAMENTO, formatBRL, formatDate, num, somaParcelas, type Linha } from "@/lib/orcamentos";
import { agruparServicos, type CondServico, type ParcelaServico } from "@/lib/oferta-cronogramas";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SearchSelect } from "@/components/data-table/SearchSelect";

type Props = {
  parcelas: ParcelaServico[];
  readOnly?: boolean | undefined;
  onCond: (sid: string, patch: Partial<CondServico>) => void;
  onLinha: (key: string, patch: Partial<Linha>) => void;
};

const formaOptions = [...FORMAS_PAGAMENTO].sort((a, b) => a.localeCompare(b, "pt-BR")).map((f) => ({ value: f, label: f }));

/** Um bloco de cobrança editável por serviço avulso (forma, parcelas, 1ª parcela, entrada, datas e valores). */
export function ServicosCobranca({ parcelas, readOnly, onCond, onLinha }: Props) {
  const grupos = agruparServicos(parcelas);
  if (grupos.length === 0) return null;
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Como o cliente vai pagar cada serviço</p>
        <p className="text-muted-foreground text-xs">Cada serviço tem seu próprio pagamento, separado dos produtos. Escolha a forma, em quantas vezes e quando começa.</p>
      </div>
      {grupos.map(({ linha, parcelas: ps }) => {
        const p0 = ps[0]!;
        const sid = p0.sid ?? linha;
        const n = ps.length;
        const total = somaParcelas(ps);
        const entradaValor = n >= 2 && num(p0.entrada) > 0 ? p0.valor : 0;
        const fixas = Object.fromEntries(ps.filter((p) => p.fixa).map((p) => [p.numero, p.valor]));
        const datas = Object.fromEntries(ps.filter((p) => p.data_manual).map((p) => [p.numero, p.vencimento]));
        const titulo = p0.descricao;
        return (
          <div key={linha} className="bg-muted/20 space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <CalendarClock className="text-primary h-4 w-4" aria-hidden />
              <p className="text-sm font-semibold">{titulo}</p>
              {p0.bloco && <span className="bg-muted rounded px-2 py-0.5 text-xs">{p0.bloco}</span>}
              <span className="text-muted-foreground ml-auto text-sm font-semibold tabular-nums">{formatBRL(total)}</span>
            </div>
            <p className="text-sm">
              <strong>Resumo para o cliente:</strong>{" "}
              {total <= 0 ? "comodato com taxa isenta, sem cobrança" : n === 1 ? `à vista, ${formatBRL(total)} em ${formatDate(p0.vencimento)}`
                : entradaValor > 0 ? `entrada de ${formatBRL(entradaValor)} + ${n - 1}x de ${formatBRL(ps[1]!.valor)}`
                : `${n}x de ${formatBRL(p0.valor)}`}
              {total > 0 && n > 1 && `, começando em ${formatDate(p0.vencimento)}`}
            </p>
            <ToggleGroup type="single" variant="outline" className="w-full" value={p0.modo ?? "sem_juros"} disabled={Boolean(readOnly)}
              onValueChange={(v) => v && onCond(sid, { modo: v as CondServico["modo"], fixas: {} })} aria-label="Condição do serviço">
              <ToggleGroupItem value="sem_juros" className="flex-1">Sem juros</ToggleGroupItem>
              <ToggleGroupItem value="com_juros" className="flex-1">Com juros</ToggleGroupItem>
              <ToggleGroupItem value="comodato" className="flex-1">Comodato</ToggleGroupItem>
            </ToggleGroup>
            {p0.modo === "com_juros" && (
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor={`sp-j-${linha}`} className="block text-xs font-medium">Juros ao mês (%)</Label>
                <Input id={`sp-j-${linha}`} inputMode="decimal" placeholder="Ex.: 1,99" disabled={Boolean(readOnly)} value={p0.juros ?? ""}
                  onChange={(e) => onCond(sid, { juros: e.target.value, fixas: {} })} />
              </div>
            )}
            {p0.modo === "comodato" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`sp-t-${linha}`} className="block text-xs font-medium">Taxa de instalação (R$)</Label>
                  <Input id={`sp-t-${linha}`} inputMode="decimal" placeholder="Ex.: 500,00" disabled={Boolean(readOnly) || Boolean(p0.taxa_isenta)} value={p0.taxa_instalacao ?? ""}
                    onChange={(e) => onCond(sid, { taxa_instalacao: e.target.value, fixas: {} })} />
                  <p className="text-muted-foreground text-xs">No comodato o cliente paga só esta taxa; o serviço fica embutido no contrato.</p>
                </div>
                <div className="flex items-start justify-between gap-3 rounded-md border p-3">
                  <Label htmlFor={`sp-i-${linha}`} className="text-sm">Isentar taxa de instalação</Label>
                  <Switch id={`sp-i-${linha}`} checked={Boolean(p0.taxa_isenta)} disabled={Boolean(readOnly)}
                    onCheckedChange={(v) => onCond(sid, { taxa_isenta: v, fixas: {} })} />
                </div>
              </div>
            )}
            {total > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="block text-xs font-medium">Forma de pagamento</Label>
                <SearchSelect value={p0.forma ?? ""} onChange={(v) => onCond(sid, { forma: v })} options={formaOptions}
                  placeholder="Igual à dos produtos" searchPlaceholder="Pesquisar…" disabled={Boolean(readOnly)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`sp-n-${linha}`} className="block text-xs font-medium">Em quantas vezes?</Label>
                <Input id={`sp-n-${linha}`} type="number" min={1} max={120} inputMode="numeric" disabled={Boolean(readOnly)}
                  value={String(n)} onChange={(e) => { onLinha(linha, { parcelas_faturamento: e.target.value }); onCond(sid, { fixas: {}, datas: {} }); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`sp-d-${linha}`} className="block text-xs font-medium">Quando vence a 1ª?</Label>
                <Input id={`sp-d-${linha}`} type="date" disabled={Boolean(readOnly)} value={p0.vencimento}
                  onChange={(e) => { if (e.target.value) { onLinha(linha, { dt_inicio_faturamento: e.target.value }); onCond(sid, { datas: {} }); } }} />
              </div>
              {n >= 2 && (
                <div className="space-y-1.5">
                  <Label htmlFor={`sp-e-${linha}`} className="block text-xs font-medium">Tem entrada? (opcional)</Label>
                  <div className="flex gap-2">
                    <ToggleGroup type="single" variant="outline" size="sm" value={p0.entrada_tipo ?? "percentual"} disabled={Boolean(readOnly)}
                      onValueChange={(v) => v && onCond(sid, { entrada_tipo: v as "percentual" | "valor" })}>
                      <ToggleGroupItem value="percentual" className="px-3">%</ToggleGroupItem>
                      <ToggleGroupItem value="valor" className="px-3">R$</ToggleGroupItem>
                    </ToggleGroup>
                    <Input id={`sp-e-${linha}`} inputMode="decimal" disabled={Boolean(readOnly)} value={p0.entrada ?? ""}
                      placeholder={p0.entrada_tipo === "valor" ? "Ex.: 500,00" : "Ex.: 30"}
                      onChange={(e) => onCond(sid, { entrada: e.target.value })} />
                  </div>
                </div>
              )}
            </div>
            )}
            {total > 0 && (
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
                  {ps.map((p) => (
                    <tr key={p.numero} className="border-t">
                      <td className="px-3 py-2 tabular-nums">{p.numero}/{n}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {readOnly ? formatDate(p.vencimento) : (
                          <Input type="date" aria-label={`Vencimento da parcela ${p.numero} de ${p0.descricao}`}
                            className={`h-8 w-40 tabular-nums ${p.data_manual ? "border-primary" : ""}`} value={p.vencimento}
                            onChange={(e) => {
                              const d = { ...datas };
                              if (e.target.value) d[p.numero] = e.target.value; else delete d[p.numero];
                              onCond(sid, { datas: d });
                            }} />
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {readOnly || n < 2 || (entradaValor > 0 && p.numero === 1) ? formatBRL(p.valor) : (
                          <Input key={`${p.numero}-${p.valor}`} inputMode="decimal" aria-label={`Valor da parcela ${p.numero} de ${p0.descricao}`}
                            defaultValue={p.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            className={`ml-auto h-8 w-32 text-right tabular-nums ${p.fixa ? "border-primary" : ""}`}
                            onBlur={(e) => {
                              const f = { ...fixas };
                              if (e.target.value.trim() === "") delete f[p.numero];
                              else if (Math.abs(num(e.target.value) - p.valor) >= 0.01) f[p.numero] = num(e.target.value);
                              else return;
                              onCond(sid, { fixas: f });
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
            {!readOnly && (Object.keys(fixas).length > 0 || Object.keys(datas).length > 0) && (
              <button type="button" className="text-primary text-xs underline underline-offset-2" onClick={() => onCond(sid, { fixas: {}, datas: {} })}>
                Voltar para parcelas iguais, uma por mês
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
