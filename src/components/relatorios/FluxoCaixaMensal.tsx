import { formatBRL } from "@/lib/orcamentos";
import { rotuloMes, type MesCaixa } from "@/lib/fluxo-caixa";
import { cn } from "@/lib/utils";

const LINHAS: Array<{ k: keyof MesCaixa; label: string; sinal: "+" | "-" | "=" }> = [
  { k: "entradas", label: "Entradas de clientes", sinal: "+" },
  { k: "fornecedores", label: "Pagamento a fornecedores", sinal: "-" },
  { k: "impostos", label: "Impostos", sinal: "-" },
  { k: "comissoes", label: "Comissões", sinal: "-" },
  { k: "despesas", label: "Despesas operacionais", sinal: "-" },
  { k: "saldo", label: "Saldo do mês", sinal: "=" },
  { k: "acumulado", label: "Caixa acumulado", sinal: "=" },
];

const total = (m: MesCaixa[], k: keyof MesCaixa) =>
  k === "acumulado" ? (m[m.length - 1]?.acumulado ?? 0) : m.reduce((s, x) => s + (x[k] as number), 0);

/** Tabela mês a mês (tela e PDF). */
export function TabelaFluxo({ meses, print }: { meses: MesCaixa[]; print?: boolean }) {
  if (!meses.length) return <p className={print ? "" : "text-muted-foreground text-sm"}>Sem parcelas para projetar.</p>;
  return (
    <table className={print ? "dre-tab dre-fluxo" : "w-full min-w-max text-xs"}>
      <thead className={print ? "" : "text-muted-foreground"}>
        <tr>
          <th className={cn(!print && "bg-card sticky left-0 py-1.5 pr-3 text-left")}>Conta</th>
          {meses.map((m) => <th key={m.mes} className={print ? "r" : "px-2 text-right"}>{rotuloMes(m.mes)}</th>)}
          <th className={print ? "r" : "px-2 text-right"}>Total</th>
        </tr>
      </thead>
      <tbody>
        {LINHAS.map((l) => (
          <tr key={l.k} className={cn(!print && "border-t", l.sinal === "=" && (print ? "dre-sub" : "font-semibold"))}>
            <td className={cn(!print && "bg-card sticky left-0 py-1.5 pr-3")}>({l.sinal}) {l.label}</td>
            {[...meses.map((m) => m[l.k] as number), total(meses, l.k)].map((v, i) => (
              <td key={i} className={cn(print ? "r" : "px-2 text-right tabular-nums", !print && l.sinal === "=" && v < 0 && "text-destructive", !print && l.sinal === "-" && v > 0 && "text-muted-foreground")}>
                {v ? formatBRL(v) : "—"}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Seção da tela: resumo, gráfico de barras e tabela. */
export function FluxoCaixaSecao({ meses }: { meses: MesCaixa[] }) {
  const max = Math.max(1, ...meses.flatMap((m) => [m.entradas, m.saidas]));
  const menor = meses.reduce<MesCaixa | null>((a, m) => (!a || m.acumulado < a.acumulado ? m : a), null);
  const negativos = meses.filter((m) => m.acumulado < 0).length;
  return (
    <section className="bg-card space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Fluxo de caixa projetado — mês a mês</h2>
          <p className="text-muted-foreground text-xs">Recebimentos pelas parcelas do cliente; fornecedor pela condição de compra; impostos no mês seguinte; comissões junto do recebimento.</p>
        </div>
        {menor && (
          <div className={cn("rounded px-2 py-1 text-xs font-medium", menor.acumulado < 0 ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success")}>
            Menor caixa: {formatBRL(menor.acumulado)} em {rotuloMes(menor.mes)}{negativos ? ` • ${negativos} mês(es) no vermelho` : ""}
          </div>
        )}
      </div>
      {!!meses.length && (
        <div className="flex h-36 items-end gap-1 overflow-x-auto">
          {meses.map((m) => (
            <div key={m.mes} className="flex min-w-10 flex-1 flex-col items-center gap-1" title={`${rotuloMes(m.mes)}: entradas ${formatBRL(m.entradas)} • saídas ${formatBRL(m.saidas)} • acumulado ${formatBRL(m.acumulado)}`}>
              <div className="flex h-28 w-full items-end justify-center gap-0.5">
                <div className="bg-primary w-1/3 rounded-t" style={{ height: `${(m.entradas / max) * 100}%` }} />
                <div className="bg-destructive/70 w-1/3 rounded-t" style={{ height: `${(m.saidas / max) * 100}%` }} />
              </div>
              <span className={cn("text-[10px]", m.acumulado < 0 ? "text-destructive font-semibold" : "text-muted-foreground")}>{rotuloMes(m.mes)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="text-muted-foreground flex gap-4 text-xs">
        <span className="flex items-center gap-1"><span className="bg-primary h-2 w-2 rounded-full" />Entradas</span>
        <span className="flex items-center gap-1"><span className="bg-destructive/70 h-2 w-2 rounded-full" />Saídas</span>
        <span>Mês em vermelho = caixa acumulado negativo</span>
      </div>
      <div className="overflow-x-auto"><TabelaFluxo meses={meses} /></div>
    </section>
  );
}
