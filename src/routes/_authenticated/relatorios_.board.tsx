import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTableRows } from "@/lib/crud";
import { formatBRL, num } from "@/lib/orcamentos";
import { hojeISO } from "@/lib/financeiro";
import { useEmpresaAtiva } from "@/hooks/useEmpresaAtiva";
import { cn } from "@/lib/utils";
import type { Row } from "@/lib/row";
import {
  agingReceber, concentracao, despesasPorCategoria, evolucaoMensal, farol, inadimplencia,
  mesesEntre, pipelinePorTemperatura, prazoMedio, savingCotacoes, taxaConversao,
} from "@/lib/board";

export const Route = createFileRoute("/_authenticated/relatorios_/board")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Painel do Board — Atende.ai" },
      { name: "description", content: "Relatório executivo para a diretoria: caixa, receita recorrente, cobrança, ofertas e compras." },
      { property: "og:title", content: "Painel do Board — Atende.ai" },
      { property: "og:description", content: "Relatório executivo para a diretoria: caixa, receita recorrente, cobrança, ofertas e compras." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BoardPage,
});

const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const mesLabel = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
const FAROL = { verde: "border-l-success", amarelo: "border-l-warning", vermelho: "border-l-destructive" } as const;

function inicioPadrao() {
  const d = new Date();
  d.setMonth(d.getMonth() - 11, 1);
  return d.toISOString().slice(0, 10);
}

function BoardPage() {
  const emp = useEmpresaAtiva();
  const { data: titulos = [] } = useTableRows("financeiro_titulos");
  const { data: orcs = [] } = useTableRows("orcamentos");
  const { data: parceiros = [] } = useTableRows("parceiros");
  const { data: contas = [] } = useTableRows("financeiro_contas_bancarias");
  const { data: cotItens = [] } = useTableRows("cotacoes_itens");
  const { data: cotPrecos = [] } = useTableRows("cotacoes_precos");
  const [desde, setDesde] = useState(inicioPadrao());
  const [ate, setAte] = useState(hojeISO());
  const hoje = hojeISO();

  const nomeParc = (id: string) => {
    const p = parceiros.find((x) => String(x["id"]) === id);
    return String(p?.["nome_fantasia"] || p?.["razao_social"] || p?.["nome"] || "Sem parceiro");
  };

  const d = useMemo(() => {
    const noPeriodo = (o: Row) => { const c = String(o["created_at"] ?? "").slice(0, 10); return c >= desde && c <= ate; };
    const ofertas = orcs.filter(noPeriodo);
    const pipe = pipelinePorTemperatura(ofertas);
    const g = (l: string) => pipe.find((x) => x.label === l);
    const ganho = g("Ganho");
    const perdidas = g("Perdido")?.qtd ?? 0;
    const mrr = pipelinePorTemperatura(orcs).find((x) => x.label === "Ganho")?.mensal ?? 0;
    const misto = orcs.filter((o) => o["faturamento_misto"] === true).length;
    const caixa = contas.reduce((s, c) => s + num(c["saldo_atual"]), 0);
    const limite = contas.reduce((s, c) => s + num(c["saldo_limite"]), 0);
    const evol = evolucaoMensal(titulos, mesesEntre(desde, ate));
    const receita = evol.reduce((s, x) => s + x.receberRealizado, 0);
    const despesa = evol.reduce((s, x) => s + x.pagarRealizado, 0);
    const pmr = prazoMedio(titulos, "receber", desde, ate);
    const pmp = prazoMedio(titulos, "pagar", desde, ate);
    return {
      pipe, ganho, perdidas, mrr, misto, caixa, limite, evol, receita, despesa, pmr, pmp,
      conv: taxaConversao(ganho?.qtd ?? 0, perdidas),
      aging: agingReceber(titulos, hoje),
      inad: inadimplencia(titulos, hoje),
      topRec: concentracao(titulos, "receber", desde, ate),
      topPag: concentracao(titulos, "pagar", desde, ate),
      categorias: despesasPorCategoria(titulos, desde, ate),
      saving: savingCotacoes(cotItens, cotPrecos),
      ticket: ganho && ganho.qtd ? { impl: ganho.implantacao / ganho.qtd, mensal: ganho.mensal / ganho.qtd } : { impl: 0, mensal: 0 },
      totalOfertas: ofertas.length,
    };
  }, [orcs, titulos, contas, cotItens, cotPrecos, desde, ate, hoje]);

  const resultado = d.receita - d.despesa;
  const margem = d.receita > 0 ? (resultado / d.receita) * 100 : 0;
  const maxEvol = Math.max(1, ...d.evol.flatMap((x) => [x.receberRealizado, x.pagarRealizado, x.receberPrevisto, x.pagarPrevisto]));
  const totalAging = d.aging.reduce((s, x) => s + x.valor, 0) || 1;
  const totalCat = d.categorias.reduce((s, x) => s + x.valor, 0) || 1;

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild><Link to="/relatorios" aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <h1 className="text-2xl font-bold text-foreground">Painel do Board</h1>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><Label className="text-xs">De</Label><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div><Label className="text-xs">Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
          <Button onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" /> Imprimir / PDF</Button>
        </div>
      </div>

      <header className="hidden border-b border-border pb-3 print:block">
        <h1 className="text-xl font-bold">{emp.nome || "Relatório"} — Relatório ao Board</h1>
        <p className="text-sm text-muted-foreground">Período de {new Date(desde + "T12:00").toLocaleDateString("pt-BR")} a {new Date(ate + "T12:00").toLocaleDateString("pt-BR")}</p>
      </header>

      <Secao titulo="Resumo executivo">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Kpi titulo="Caixa em bancos" valor={formatBRL(d.caixa)} sub={d.limite ? `+ ${formatBRL(d.limite)} de limite` : "Saldo da última consulta"} cor={farol(d.caixa, 1, 0)} />
          <Kpi titulo="Receita recorrente (MRR)" valor={formatBRL(d.mrr)} sub="Ofertas ganhas" cor={farol(d.mrr, 1, 0)} />
          <Kpi titulo="Resultado do período" valor={formatBRL(resultado)} sub={`Margem ${pct(margem)}`} cor={farol(margem, 15, 0)} />
          <Kpi titulo="Inadimplência +30d" valor={pct(d.inad)} sub="Do saldo a receber" cor={farol(d.inad, 5, 15, true)} />
          <Kpi titulo="Prazo receber × pagar" valor={`${d.pmr} × ${d.pmp} dias`} sub={d.pmr > d.pmp ? "Recebe depois de pagar" : "Prazos equilibrados"} cor={farol(d.pmr - d.pmp, 0, 15, true)} />
          <Kpi titulo="Economia em compras" valor={formatBRL(d.saving.valor)} sub={`${pct(d.saving.pct)} nas cotações`} cor={farol(d.saving.pct, 5, 1)} />
        </div>
      </Secao>

      <Secao titulo="Evolução de contas a receber e a pagar">
        <div className="overflow-x-auto">
          <div className="flex min-w-[640px] items-end gap-2" style={{ height: 180 }}>
            {d.evol.map((m) => (
              <div key={m.mes} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-[150px] w-full items-end justify-center gap-0.5">
                  <div className="w-1/4 rounded-t bg-success" style={{ height: `${(m.receberRealizado / maxEvol) * 100}%` }} title={`Recebido ${formatBRL(m.receberRealizado)}`} />
                  <div className="w-1/4 rounded-t bg-success/30" style={{ height: `${(m.receberPrevisto / maxEvol) * 100}%` }} title={`A receber previsto ${formatBRL(m.receberPrevisto)}`} />
                  <div className="w-1/4 rounded-t bg-destructive" style={{ height: `${(m.pagarRealizado / maxEvol) * 100}%` }} title={`Pago ${formatBRL(m.pagarRealizado)}`} />
                  <div className="w-1/4 rounded-t bg-destructive/30" style={{ height: `${(m.pagarPrevisto / maxEvol) * 100}%` }} title={`A pagar previsto ${formatBRL(m.pagarPrevisto)}`} />
                </div>
                <span className="text-[10px] text-muted-foreground">{mesLabel(m.mes)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <Legenda c="bg-success" t="Recebido" /><Legenda c="bg-success/30" t="Previsto a receber" />
          <Legenda c="bg-destructive" t="Pago" /><Legenda c="bg-destructive/30" t="Previsto a pagar" />
        </div>
        <Tabela
          cab={["Mês", "Previsto receber", "Recebido", "Previsto pagar", "Pago", "Resultado"]}
          linhas={d.evol.map((m) => [mesLabel(m.mes), formatBRL(m.receberPrevisto), formatBRL(m.receberRealizado), formatBRL(m.pagarPrevisto), formatBRL(m.pagarRealizado), formatBRL(m.resultado)])}
          rodape={["Total", "", formatBRL(d.receita), "", formatBRL(d.despesa), formatBRL(resultado)]}
        />
      </Secao>

      <div className="grid gap-6 lg:grid-cols-2">
        <Secao titulo="Idade dos valores a receber">
          <div className="space-y-2">
            {d.aging.map((a, i) => (
              <Barra key={a.faixa} rotulo={`${a.faixa} (${a.qtd})`} valor={formatBRL(a.valor)} pct={(a.valor / totalAging) * 100}
                cor={i === 0 ? "bg-success" : i <= 2 ? "bg-warning" : "bg-destructive"} />
            ))}
          </div>
        </Secao>
        <Secao titulo="Despesas pagas por categoria">
          <div className="space-y-2">
            {d.categorias.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma despesa paga no período.</p>}
            {d.categorias.slice(0, 10).map((c) => (
              <Barra key={c.categoria} rotulo={c.categoria} valor={formatBRL(c.valor)} pct={(c.valor / totalCat) * 100} cor="bg-primary" />
            ))}
          </div>
        </Secao>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Secao titulo="Maiores pagadores (dependência de clientes)">
          <Tabela cab={["Pagador", "Valor", "%", "Acumulado"]} linhas={d.topRec.map((x) => [nomeParc(x.id), formatBRL(x.valor), pct(x.pct), pct(x.acumulado)])} />
          {d.topRec[0] && d.topRec[0].pct > 20 && <p className="mt-2 text-xs text-destructive">Atenção: um único pagador responde por mais de 20% da receita.</p>}
        </Secao>
        <Secao titulo="Maiores fornecedores">
          <Tabela cab={["Fornecedor", "Valor", "%", "Acumulado"]} linhas={d.topPag.map((x) => [nomeParc(x.id), formatBRL(x.valor), pct(x.pct), pct(x.acumulado)])} />
        </Secao>
      </div>

      <Secao titulo="Ofertas e vendas">
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi titulo="Ofertas no período" valor={String(d.totalOfertas)} />
          <Kpi titulo="Taxa de conversão" valor={pct(d.conv)} sub={`${d.ganho?.qtd ?? 0} ganhas • ${d.perdidas} perdidas`} cor={farol(d.conv, 30, 15)} />
          <Kpi titulo="Ticket médio" valor={formatBRL(d.ticket.impl)} sub={`+ ${formatBRL(d.ticket.mensal)}/mês`} />
          <Kpi titulo="Com faturamento misto" valor={String(d.misto)} sub="Mais de um pagador" />
        </div>
        <Tabela cab={["Temperatura", "Qtd", "Implantação", "Mensalidade"]} linhas={d.pipe.map((p) => [p.label, String(p.qtd), formatBRL(p.implantacao), formatBRL(p.mensal)])} />
      </Secao>

      <Secao titulo="Compras">
        <p className="text-sm text-muted-foreground">
          Nas cotações com dois ou mais fornecedores, o valor fechado foi <b className="text-foreground">{formatBRL(d.saving.base - d.saving.valor)}</b> contra{" "}
          <b className="text-foreground">{formatBRL(d.saving.base)}</b> da proposta mais cara — economia de <b className="text-success">{formatBRL(d.saving.valor)} ({pct(d.saving.pct)})</b>.
        </p>
      </Secao>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 break-inside-avoid">
      <h2 className="mb-3 text-base font-semibold text-foreground">{titulo}</h2>
      {children}
    </section>
  );
}

function Kpi({ titulo, valor, sub, cor }: { titulo: string; valor: string; sub?: string; cor?: keyof typeof FAROL }) {
  return (
    <div className={cn("rounded-md border border-border border-l-4 bg-background p-3", cor ? FAROL[cor] : "border-l-border")}>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="text-lg font-bold text-foreground">{valor}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Barra({ rotulo, valor, pct: p, cor }: { rotulo: string; valor: string; pct: number; cor: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs"><span>{rotulo}</span><span className="font-medium">{valor}</span></div>
      <div className="mt-1 h-2 rounded bg-muted"><div className={cn("h-2 rounded", cor)} style={{ width: `${Math.min(100, p)}%` }} /></div>
    </div>
  );
}

function Legenda({ c, t }: { c: string; t: string }) {
  return <span className="flex items-center gap-1"><span className={cn("h-2.5 w-2.5 rounded-sm", c)} />{t}</span>;
}

function Tabela({ cab, linhas, rodape }: { cab: string[]; linhas: string[][]; rodape?: string[] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-border text-left text-xs text-muted-foreground">{cab.map((c, i) => <th key={c} className={cn("p-2", i > 0 && "text-right")}>{c}</th>)}</tr></thead>
        <tbody>
          {linhas.length === 0 && <tr><td colSpan={cab.length} className="p-3 text-center text-muted-foreground">Sem dados no período.</td></tr>}
          {linhas.map((l, i) => <tr key={i} className="border-b border-border/50">{l.map((c, j) => <td key={j} className={cn("p-2", j > 0 && "text-right")}>{c}</td>)}</tr>)}
        </tbody>
        {rodape && <tfoot><tr className="font-semibold">{rodape.map((c, j) => <td key={j} className={cn("p-2", j > 0 && "text-right")}>{c}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}
