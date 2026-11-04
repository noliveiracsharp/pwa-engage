import { useMemo, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { SearchSelect } from "@/components/data-table/SearchSelect";
import { rowId, text } from "@/lib/crud";
import { formatBRL, num, round2 } from "@/lib/orcamentos";
import type { Row } from "@/lib/row";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotulo = (k: string) => `${MESES[Number(k.slice(5, 7)) - 1]}/${k.slice(2, 4)}`;

/** Faturas mês a mês (soma das parcelas do cartão por mês de vencimento). */
export function FaturasCartaoGrafico({ cartoes, titulos }: { cartoes: Row[]; titulos: Row[] }) {
  const [sel, setSel] = useState("");
  const hoje = new Date();
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const dados = useMemo(() => {
    const por = new Map<string, { total: number; aberto: number; qtd: number }>();
    for (const t of titulos) {
      if (t["status"] === "cancelado" || !t["cartao_id"]) continue;
      if (sel && text(t["cartao_id"]) !== sel) continue;
      const k = text(t["vencimento"]).slice(0, 7);
      if (k.length !== 7) continue;
      const v = por.get(k) ?? { total: 0, aberto: 0, qtd: 0 };
      v.total += num(t["valor"]); v.qtd++;
      if (t["status"] !== "pago") v.aberto += num(t["valor"]);
      por.set(k, v);
    }
    // Janela: 3 meses atrás até 8 à frente.
    const out = [];
    for (let i = -3; i <= 8; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const v = por.get(k) ?? { total: 0, aberto: 0, qtd: 0 };
      out.push({ k, mes: rotulo(k), total: round2(v.total), aberto: round2(v.aberto), qtd: v.qtd });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titulos, sel, mesAtual]);
  const [foco, setFoco] = useState(mesAtual);
  const f = dados.find((d) => d.k === foco) ?? dados[3];
  const cor = (k: string) => (k === foco ? "var(--primary)" : k < mesAtual ? "var(--success)" : "var(--muted-foreground)");
  const opts = [...cartoes].sort((a, b) => text(a["descricao"]).localeCompare(text(b["descricao"]))).map((c) => ({ value: text(rowId(c)), label: `${text(c["descricao"])}${c["final4"] ? ` • final ${text(c["final4"])}` : ""}` }));
  return (
    <div className="bg-card space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="font-semibold">Faturas mês a mês</h3>
          <p className="text-muted-foreground text-xs">Verde: meses anteriores • Destaque: mês selecionado • Cinza: parcelas futuras já comprometidas.</p>
        </div>
        <div className="w-64"><SearchSelect value={sel} onChange={setSel} options={[{ value: "", label: "Todos os cartões" }, ...opts]} placeholder="Todos os cartões" /></div>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={12} />
            <Tooltip formatter={(v: number) => formatBRL(v)} labelFormatter={(l) => `Fatura ${l}`} cursor={{ fill: "var(--muted)" }} />
            <Bar dataKey="total" name="Fatura" radius={[4, 4, 0, 0]} onClick={(d: { k?: string }) => d.k && setFoco(d.k)} className="cursor-pointer">
              {dados.map((d) => <Cell key={d.k} fill={cor(d.k)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {f && (
        <div className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-3">
          <div><p className="text-muted-foreground text-xs">Fatura {f.mes}</p><p className="text-lg font-semibold tabular-nums">{formatBRL(f.total)}</p></div>
          <div><p className="text-muted-foreground text-xs">Em aberto</p><p className="font-semibold tabular-nums">{formatBRL(f.aberto)}</p></div>
          <div><p className="text-muted-foreground text-xs">Lançamentos</p><p className="font-semibold tabular-nums">{f.qtd}</p></div>
        </div>
      )}
    </div>
  );
}
