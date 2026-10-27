import { Fragment, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterBar, FilterSelect } from "@/components/data-table/FilterField";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useEmpresaAtiva } from "@/hooks/useEmpresaAtiva";
import { useAudit } from "@/lib/audit";
import { useTableRows } from "@/lib/crud";
import { formatBRL } from "@/lib/orcamentos";
import { apurarDre, type ApuracaoDre, type Natureza } from "@/lib/dre-gerencial";
import { imprimirDre } from "@/components/relatorios/DreRelatorioPDF";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/relatorios_/dre-gerencial")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "DRE Gerencial Consolidado — Atende.ai" },
      { name: "description", content: "Demonstrativo de resultado real por plano de contas, centro de custo e regime." },
      { property: "og:title", content: "DRE Gerencial Consolidado — Atende.ai" },
      { property: "og:description", content: "Demonstrativo de resultado real por plano de contas, centro de custo e regime." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DreGerencialPage,
});

const ano = new Date().getFullYear();
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const mesLabel = (m: string) => `${m.slice(5, 7)}/${m.slice(2, 4)}`;
const GRUPOS: { nat: Natureza; titulo: string }[] = [
  { nat: "receita", titulo: "Receita bruta" },
  { nat: "deducao", titulo: "(-) Deduções" },
  { nat: "custo", titulo: "(-) Custos" },
  { nat: "despesa", titulo: "(-) Despesas operacionais" },
  { nat: "financeiro", titulo: "(+/-) Resultado financeiro" },
];

function DreGerencialPage() {
  const perms = usePagePermissions("/relatorios");
  const { empresaId } = useAudit();
  const emp = useEmpresaAtiva();
  const { data: titulos = [] } = useTableRows("financeiro_titulos");
  const { data: itens = [] } = useTableRows("financeiro_titulos_itens" as never);
  const { data: contas = [] } = useTableRows("plano_contas" as never);
  const { data: centros = [] } = useTableRows("centro_custo");
  const [f, setF] = useState({ inicio: `${ano}-01-01`, fim: `${ano}-12-31`, regime: "competencia" as "competencia" | "caixa", centro: "todos" });

  const daEmpresa = <T extends Record<string, unknown>>(l: T[]) =>
    l.filter((r) => empresaId === undefined || !r["empresa_id"] || String(r["empresa_id"]) === String(empresaId));
  const centrosEmp = daEmpresa(centros);
  const a = useMemo(
    () => apurarDre(daEmpresa(titulos), daEmpresa(itens), daEmpresa(contas), {
      inicio: f.inicio, fim: f.fim, regime: f.regime, centro: f.centro === "todos" ? undefined : f.centro,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [titulos, itens, contas, f, empresaId],
  );
  const nomeCentro = f.centro === "todos" ? "Todos" : String(centrosEmp.find((c) => String(c["id"]) === f.centro)?.["descricao"] ?? "—");
  const periodo = `${f.inicio.split("-").reverse().join("/")} a ${f.fim.split("-").reverse().join("/")}`;
  const filtros = `Regime: ${f.regime === "caixa" ? "Caixa" : "Competência"} • Centro de custo: ${nomeCentro}`;

  if (!perms.canRead) return <p className="text-muted-foreground">Sem permissão para Relatórios.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-foreground">DRE Gerencial Consolidado</h1>
          <p className="text-sm text-muted-foreground">Resultado real a partir dos títulos financeiros e seus rateios.</p>
        </div>
        <Button variant="outline" onClick={imprimirDre}><Printer className="mr-1 h-4 w-4" />Imprimir / PDF</Button>
      </div>

      <FilterBar className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <div className="space-y-1"><Label>De</Label><Input type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></div>
        <div className="space-y-1"><Label>Até</Label><Input type="date" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} /></div>
        <FilterSelect label="Regime" value={f.regime} onChange={(v) => setF({ ...f, regime: v as "competencia" | "caixa" })}
          options={[{ value: "caixa", label: "Caixa (pagamentos)" }, { value: "competencia", label: "Competência" }]} />
        <FilterSelect label="Centro de custo" value={f.centro} onChange={(v) => setF({ ...f, centro: v })}
          options={[{ value: "todos", label: "Todos" }, ...centrosEmp.map((c) => ({ value: String(c["id"]), label: String(c["descricao"] ?? "") }))
            .sort((x, y) => x.label.localeCompare(y.label, "pt-BR"))]} />
      </FilterBar>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 print:hidden">
        <Kpi t="Receita líquida" v={formatBRL(a.receitaLiquida)} />
        <Kpi t="Margem de contribuição" v={formatBRL(eq.mc)} sub={`${pct(eq.mcPct)} da receita líquida`} />
        <Kpi t="Despesas fixas" v={formatBRL(a.despesas)} />
        <Kpi t="Ponto de equilíbrio" v={eq.pe === null ? "—" : formatBRL(eq.pe)} sub={eq.pe === null ? "Sem margem de contribuição" : `${meses} mês(es) no período`} />
        <Kpi t="Resultado líquido" v={formatBRL(a.resultadoLiquido)} sub={`Margem ${pct(a.margemLiquida)}`} destaque />
      </div>
      <p className="text-muted-foreground text-xs print:hidden">
        Margem de contribuição = receita líquida − custos (contas de natureza Custo direto). Ponto de equilíbrio = despesas ÷ margem de contribuição %: o faturamento líquido mínimo para não ter prejuízo.
        {a.naoClassificado.quantidade > 0 && ` Não classificado: ${formatBRL(a.naoClassificado.receber - a.naoClassificado.pagar)}.`}
      </p>

      {a.naoClassificado.quantidade > 0 && (
        <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-foreground print:hidden">
          Há {a.naoClassificado.quantidade} linha(s) de títulos sem Plano de Contas (a receber {formatBRL(a.naoClassificado.receber)}, a pagar {formatBRL(a.naoClassificado.pagar)}).
          Elas ficam fora do resultado. Classifique-as no Financeiro, no Detalhamento de Itens/Rateio do título.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card print:hidden">
        <TabelaDre a={a} />
      </div>

      <div className="hidden">
        <div id="dre-print" className="dre-doc">
          <header className="dre-head">
            <div className="dre-emp">
              {emp.logo && <img src={emp.logo} alt="" data-no-zoom />}
              <div><div className="dre-emp-nome">{emp.nome}</div><div className="dre-rot">Relatório gerencial • Confidencial</div></div>
            </div>
            <div className="dre-head-dir"><div className="dre-rot">Emitido em</div><div>{new Date().toLocaleString("pt-BR")}</div></div>
          </header>
          <div className="dre-titulo"><h1>DRE Gerencial Consolidado</h1><p>{periodo} • {a.quantidadeTitulos} títulos • {filtros}</p></div>
          <table className="dre-kpis"><tbody><tr>
            <td><span>Receita líquida</span><strong>{formatBRL(a.receitaLiquida)}</strong></td>
            <td><span>Lucro bruto</span><strong>{formatBRL(a.lucroBruto)}</strong></td>
            <td><span>Despesas</span><strong>{formatBRL(a.despesas)}</strong></td>
            <td><span>Financeiro</span><strong>{formatBRL(a.financeiro)}</strong></td>
            <td className="dre-kpi-res"><span>Resultado líquido</span><strong>{formatBRL(a.resultadoLiquido)}</strong><small>Margem {pct(a.margemLiquida)}</small></td>
          </tr></tbody></table>
          <h2>1. Demonstrativo por plano de contas</h2>
          <TabelaDre a={a} doc />
          {a.naoClassificado.quantidade > 0 && <p>Não classificado (fora do resultado): a receber {formatBRL(a.naoClassificado.receber)} • a pagar {formatBRL(a.naoClassificado.pagar)}.</p>}
        </div>
      </div>
    </div>
  );
}

function Kpi({ t, v, sub, destaque }: { t: string; v: string; sub?: string; destaque?: boolean }) {
  return (
    <div className={cn("rounded-lg border bg-card p-3", destaque && "border-primary/50")}>
      <div className="text-xs text-muted-foreground">{t}</div>
      <div className="text-lg font-bold text-foreground">{v}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function TabelaDre({ a, doc }: { a: ApuracaoDre; doc?: boolean }) {
  const meses = doc ? [] : a.meses;
  const exib = (n: Natureza, v: number) => (n === "receita" || n === "financeiro" ? v : -v);
  const total = (label: string, v: number) => (
    <tr className="border-t bg-muted/50 font-bold">
      <td className="p-2">{label}</td>
      {meses.map((m) => <td key={m} />)}
      <td className="p-2 text-right">{formatBRL(v)}</td>
    </tr>
  );
  return (
    <table className={cn(doc ? "dre-tab" : "w-full text-sm")}>
      <thead>
        <tr className="border-b text-left text-muted-foreground">
          <th className="p-2">Conta</th>
          {meses.map((m) => <th key={m} className="p-2 text-right">{mesLabel(m)}</th>)}
          <th className="p-2 text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        {GRUPOS.flatMap((g) => {
          const cs = a.contas.filter((c) => c.natureza === g.nat);
          const rows: React.ReactNode[] = [
            <tr key={g.nat} className="border-t font-semibold">
              <td className="p-2">{g.titulo}</td>
              {meses.map((m) => <td key={m} className="p-2 text-right">{formatBRL(exib(g.nat, cs.reduce((s, c) => s + (c.meses[m] ?? 0), 0)))}</td>)}
              <td className="p-2 text-right">{formatBRL(exib(g.nat, a.porNatureza[g.nat]))}</td>
            </tr>,
            ...cs.map((c) => (
              <tr key={c.id} className="text-muted-foreground">
                <td className="p-2 pl-6">{c.codigo} {c.descricao}</td>
                {meses.map((m) => <td key={m} className="p-2 text-right">{c.meses[m] ? formatBRL(exib(g.nat, c.meses[m])) : "—"}</td>)}
                <td className="p-2 text-right">{formatBRL(exib(g.nat, c.valor))}</td>
              </tr>
            )),
          ];
          if (g.nat === "deducao") rows.push(<Fragment key="rl">{total("= Receita líquida", a.receitaLiquida)}</Fragment>);
          if (g.nat === "custo") rows.push(<Fragment key="lb">{total("= Lucro bruto", a.lucroBruto)}</Fragment>);
          if (g.nat === "despesa") rows.push(<Fragment key="ro">{total("= Resultado operacional", a.resultadoOperacional)}</Fragment>);
          return rows;
        })}
        {total("= Resultado líquido", a.resultadoLiquido)}
      </tbody>
    </table>
  );
}
