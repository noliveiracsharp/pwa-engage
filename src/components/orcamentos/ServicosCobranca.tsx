import { CalendarClock } from "lucide-react";
import { FORMAS_PAGAMENTO, formatBRL, formatDate, num, somaParcelas, type Linha } from "@/lib/orcamentos";
import { agruparServicos, type CondServico, type ParcelaServico } from "@/lib/oferta-cronogramas";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        <p className="text-sm font-medium">Serviços avulsos — cobrança separada</p>
        <p className="text-muted-foreground text-xs">Cada serviço tem forma, entrada e parcelas próprias, fora do parcelamento acima.</p>
      </div>
      {grupos.map(({ linha, parcelas: ps }) => {
        const p0 = ps[0]!;
        const sid = p0.sid ?? linha;
        const n = ps.length;
        const total = somaParcelas(ps);
        const entradaValor = n >= 2 && num(p0.entrada) > 0 ? p0.valor : 0;
        const fixas = Object.fromEntries(ps.filter((p) => p.fixa).map((p) => [p.numero, p.valor]));
        const datas = Object.fromEntries(ps.filter((p) => p.data_manual).map((p) => [p.numero, p.vencimento]));
        const titulo = p0.bloco ? `${p0.bloco} — ${p0.descricao}` : p0.descricao;
        return (
          <div key={linha} className="bg-muted/20 space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <CalendarClock className="text-primary h-4 w-4" aria-hidden />
              <p className="text-sm font-semibold">{titulo}</p>
              <span className="text-muted-foreground ml-auto text-sm font-semibold tabular-nums">{formatBRL(total)}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="block text-xs font-medium">Forma de pagamento</Label>
                <SearchSelect value={p0.forma ?? ""} onChange={(v) => onCond(sid, { forma: v })} options={formaOptions}
                  placeholder="Mesma da Oferta" searchPlaceholder="Pesquisar…" disabled={Boolean(readOnly)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`sp-n-${linha}`} className="block text-xs font-medium">Parcelas</Label>
                <Input id={`sp-n-${linha}`} type="number" min={1} max={120} inputMode="numeric" disabled={Boolean(readOnly)}
                  value={String(n)} onChange={(e) => { onLinha(linha, { parcelas_faturamento: e.target.value }); onCond(sid, { fixas: {}, datas: {} }); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`sp-d-${linha}`} className="block text-xs font-medium">1ª parcela (início da cobrança)</Label>
                <Input id={`sp-d-${linha}`} type="date" disabled={Boolean(readOnly)} value={p0.vencimento}
                  onChange={(e) => { if (e.target.value) { onLinha(linha, { dt_inicio_faturamento: e.target.value }); onCond(sid, { datas: {} }); } }} />
              </div>
              {n >= 2 && (
                <div className="space-y-1.5">
                  <Label htmlFor={`sp-e-${linha}`} className="block text-xs font-medium">Entrada (1ª parcela)</Label>
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
            {!readOnly && (Object.keys(fixas).length > 0 || Object.keys(datas).length > 0) && (
              <button type="button" className="text-primary text-xs underline underline-offset-2" onClick={() => onCond(sid, { fixas: {}, datas: {} })}>
                Recalcular parcelas iguais e datas mensais
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
