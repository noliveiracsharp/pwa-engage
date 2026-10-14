import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Maximize2, Minimize2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/data-table/FilterField";
import { SituacaoBadge } from "@/components/orcamentos/SituacaoBadge";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useAudit } from "@/lib/audit";
import { useTableRows } from "@/lib/crud";
import { corEtapa } from "@/lib/kanban-cores";
import { etapasDoKanban, kanbanDoModuloOrcamentos } from "@/lib/orcamento-kanban";
import { categoriaDespesaLabel, formatBRL, yearOf } from "@/lib/orcamentos";
import {
  comissoesDaOferta,
  farolMargem,
  linhaDre,
  somarDre,
  trimestreDe,
  type DreLinha,
} from "@/lib/dre-ofertas";
import { type Row } from "@/lib/row";
import { cn } from "@/lib/utils";
import { useEmpresaAtiva } from "@/hooks/useEmpresaAtiva";
import { DreRelatorioDocumento, imprimirDre } from "@/components/relatorios/DreRelatorioPDF";

export const Route = createFileRoute("/_authenticated/relatorios_/dre-ofertas")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "DRE de Ofertas (Board) — Atende.ai" },
      { name: "description", content: "Visão executiva de receita, custos, despesas, comissões e margem das Ofertas." },
      { property: "og:title", content: "DRE de Ofertas (Board) — Atende.ai" },
      { property: "og:description", content: "Visão executiva de receita, custos, despesas, comissões e margem das Ofertas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DreOfertasPage,
});

const norm = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const FAROL = {
  verde: "bg-success/15 text-success",
  amarelo: "bg-warning/15 text-warning",
  vermelho: "bg-destructive/15 text-destructive",
} as const;

function DreOfertasPage() {
  const perms = usePagePermissions("/relatorios/dre-ofertas");
  const { empresaId } = useAudit();
  const { data: orcs = [] } = useTableRows("orcamentos");
  const { data: comissoes = [] } = useTableRows("orcamento_comissoes");
  const { data: parceiros = [] } = useTableRows("parceiros");
  const { data: usuarios = [] } = useTableRows("usuarios");
  const { data: etapas = [] } = useQuery({
    queryKey: ["orcamentos-etapas-kanban"],
    queryFn: async () => etapasDoKanban(await kanbanDoModuloOrcamentos()),
  });
  const [f, setF] = useState({ ano: String(new Date().getFullYear()), tri: "todos", situacao: "todos", vendedor: "todos" });
  const [apresentar, setApresentar] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const emp = useEmpresaAtiva();

  const nome = (lista: Row[], id: unknown) => {
    const r = lista.find((x) => String(x["id"]) === String(id ?? ""));
    return String(r?.["nome"] ?? r?.["razao_social"] ?? r?.["nome_fantasia"] ?? "—");
  };
  const etapaDe = (o: Row) =>
    etapas.find((e) => e.id === String(o["kanban_etapa_id"] ?? "")) ??
    etapas.find((e) => norm(e.descricao) === norm(o["situacao"]));

  const escopo = useMemo(
    () => orcs.filter((o) => empresaId === undefined || !o["empresa_id"] || String(o["empresa_id"]) === String(empresaId)),
    [orcs, empresaId],
  );
  const anos = useMemo(
    () => [...new Set(escopo.map((o) => yearOf(o["dt_orcamento"])).filter(Boolean))].sort().reverse().map(String),
    [escopo],
  );
  const vendedores = useMemo(
    () => [...new Set(escopo.map((o) => String(o["usuario_id"] ?? "")).filter(Boolean))],
    [escopo],
  );

  const filtradas = escopo.filter((o) => {
    if (f.ano !== "todos" && String(yearOf(o["dt_orcamento"])) !== f.ano) return false;
    if (f.tri !== "todos" && String(trimestreDe(o["dt_orcamento"])) !== f.tri) return false;
    if (f.vendedor !== "todos" && String(o["usuario_id"] ?? "") !== f.vendedor) return false;
    if (f.situacao !== "todos" && norm(etapaDe(o)?.descricao ?? o["situacao"]) !== norm(f.situacao)) return false;
    return true;
  });
  const linhas = filtradas.map((o) => ({ o, l: linhaDre(o, comissoesDaOferta(comissoes, String(o["id"]))) }));
  const tot = somarDre(linhas.map((x) => x.l));

  const porEtapa = (etapas.length ? etapas : []).map((e) => {
    const ls = linhas.filter((x) => etapaDe(x.o)?.id === e.id).map((x) => x.l);
    const s = somarDre(ls);
    return { e, s };
  });
  const porVendedor = Object.values(
    linhas.reduce<Record<string, { id: string; ls: DreLinha[] }>>((acc, x) => {
      const id = String(x.o["usuario_id"] ?? "");
      (acc[id] ??= { id, ls: [] }).ls.push(x.l);
      return acc;
    }, {}),
  )
    .map((v) => ({ id: v.id, s: somarDre(v.ls) }))
    .sort((a, b) => b.s.resultado - a.s.resultado);
  const top = [...linhas].sort((a, b) => b.l.liquido - a.l.liquido).slice(0, 10);
  const maxEtapa = Math.max(1, ...porEtapa.map((p) => p.s.liquido));
  const maxVend = Math.max(1, ...porVendedor.map((p) => Math.abs(p.s.liquido)));
  const despCat = Object.entries(tot.despesasPorCategoria).sort((a, b) => b[1] - a[1]);

  const cascata: { label: string; valor: number; sinal: "+" | "-" | "=" }[] = [
    { label: "Faturamento bruto previsto", valor: tot.bruto, sinal: "+" },
    { label: "Descontos concedidos", valor: tot.desconto, sinal: "-" },
    { label: "Receita líquida orçada", valor: tot.liquido, sinal: "=" },
    { label: "Custo direto (itens)", valor: tot.custo, sinal: "-" },
    { label: "Impostos estimados", valor: tot.imposto, sinal: "-" },
    { label: "Despesas operacionais", valor: tot.despesas, sinal: "-" },
    { label: "Comissões previstas", valor: tot.comissoes, sinal: "-" },
    { label: "Resultado operacional previsto", valor: tot.resultado, sinal: "=" },
  ];

  const alternarApresentacao = async () => {
    if (!document.fullscreenElement) {
      await areaRef.current?.requestFullscreen?.().catch(() => undefined);
      setApresentar(true);
    } else {
      await document.exitFullscreen().catch(() => undefined);
      setApresentar(false);
    }
  };

  const exportarCsv = () => {
    const cab = ["Número", "Cliente", "Vendedor", "Situação", "Receita líquida", "Custo", "Impostos", "Descontos", "Despesas", "Comissões", "Resultado", "Margem %"];
    const fmt = (n: number) => n.toFixed(2).replace(".", ",");
    const rows = linhas.map(({ o, l }) => [
      String(o["numero"] ?? ""), nome(parceiros, o["parceiro_id"]), nome(usuarios, o["usuario_id"]),
      etapaDe(o)?.descricao ?? String(o["situacao"] ?? ""),
      fmt(l.liquido), fmt(l.custo), fmt(l.imposto), fmt(l.desconto), fmt(l.despesas), fmt(l.comissoes), fmt(l.resultado), fmt(l.margem),
    ]);
    const csv = [cab, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `dre-ofertas-${f.ano}.csv`;
    a.click();
  };

  if (!perms.loading && !perms.canRead) {
    return <p className="text-muted-foreground text-sm">Você não tem acesso a esta página.</p>;
  }

  const periodo = `${f.ano === "todos" ? "Todos os anos" : f.ano}${f.tri !== "todos" ? ` • Q${f.tri}` : ""}`;

  return (
    <div ref={areaRef} className={cn("dre-board space-y-5", apresentar && "bg-background overflow-auto p-6")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">DRE de Ofertas — Visão do Board</h1>
          <p className="text-muted-foreground text-sm">{periodo} • {tot.quantidade} ofertas</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={exportarCsv}><Download className="mr-1 h-4 w-4" />Planilha</Button>
          <Button variant="outline" size="sm" onClick={imprimirDre}><Printer className="mr-1 h-4 w-4" />PDF</Button>
          <Button size="sm" onClick={alternarApresentacao}>
            {apresentar ? <Minimize2 className="mr-1 h-4 w-4" /> : <Maximize2 className="mr-1 h-4 w-4" />}
            {apresentar ? "Sair da apresentação" : "Modo apresentação"}
          </Button>
        </div>
      </div>

      <div className="dre-print-src" aria-hidden>
        <DreRelatorioDocumento
          empresa={{ nome: emp.nome, logo: emp.logo }}
          periodo={periodo}
          filtros={`Situação: ${f.situacao === "todos" ? "Todas" : f.situacao} • Vendedor: ${f.vendedor === "todos" ? "Todos" : nome(usuarios, f.vendedor)}`}
          tot={tot}
          cascata={cascata}
          etapas={porEtapa.map(({ e, s }) => ({ nome: e.descricao, s }))}
          vendedores={porVendedor.map(({ id, s }) => ({ nome: id ? nome(usuarios, id) : "Sem vendedor", s }))}
          despesas={despCat}
          projetos={[...linhas].sort((a, b) => b.l.liquido - a.l.liquido).map(({ o, l }) => ({
            numero: String(o["numero"] ?? "—"), cliente: nome(parceiros, o["parceiro_id"]), vendedor: nome(usuarios, o["usuario_id"]),
            situacao: String(etapaDe(o)?.descricao ?? o["situacao"] ?? "—"), l,
          }))}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <FilterSelect label="Ano" value={f.ano} onChange={(v) => setF({ ...f, ano: v })}
          options={[{ value: "todos", label: "Todos" }, ...anos.map((a) => ({ value: a, label: a }))]} />
        <FilterSelect label="Trimestre" value={f.tri} onChange={(v) => setF({ ...f, tri: v })}
          options={[{ value: "todos", label: "Ano inteiro" }, ...[1, 2, 3, 4].map((q) => ({ value: String(q), label: `Q${q}` }))]} />
        <FilterSelect label="Situação" value={f.situacao} onChange={(v) => setF({ ...f, situacao: v })}
          options={[{ value: "todos", label: "Todas" }, ...etapas.map((e) => ({ value: e.descricao, label: e.descricao }))]} />
        <FilterSelect label="Vendedor" value={f.vendedor} onChange={(v) => setF({ ...f, vendedor: v })}
          options={[{ value: "todos", label: "Todos" }, ...vendedores.map((id) => ({ value: id, label: nome(usuarios, id) }))]} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi titulo="Receita líquida" valor={formatBRL(tot.liquido)} sub={`Ticket médio ${formatBRL(tot.ticketMedio)}`} />
        <Kpi titulo="Custo + impostos" valor={formatBRL(tot.custo + tot.imposto)} />
        <Kpi titulo="Despesas operacionais" valor={formatBRL(tot.despesas)} />
        <Kpi titulo="Comissões previstas" valor={formatBRL(tot.comissoes)} />
        <Kpi titulo="Resultado previsto" valor={formatBRL(tot.resultado)}
          sub={<span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", FAROL[farolMargem(tot.margem)])}>Margem {pct(tot.margem)}</span>} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="bg-card rounded-lg border p-4">
          <h2 className="mb-3 text-sm font-semibold">DRE em cascata</h2>
          <div className="space-y-1.5">
            {cascata.map((c) => {
              const w = tot.bruto > 0 ? Math.min(100, (Math.abs(c.valor) / tot.bruto) * 100) : 0;
              return (
                <div key={c.label} className={cn("grid grid-cols-[1fr_auto] items-center gap-2 text-sm", c.sinal === "=" && "border-t pt-1.5 font-semibold")}>
                  <div>
                    <div className="flex justify-between gap-2">
                      <span>({c.sinal}) {c.label}</span>
                      <span className="text-muted-foreground text-xs">{tot.bruto > 0 ? pct((c.valor / tot.bruto) * 100) : "—"}</span>
                    </div>
                    <div className="bg-muted mt-1 h-1.5 rounded">
                      <div className={cn("h-1.5 rounded", c.sinal === "-" ? "bg-destructive/70" : c.valor < 0 ? "bg-destructive" : "bg-primary")} style={{ width: `${w}%` }} />
                    </div>
                  </div>
                  <span className={cn("min-w-28 text-right tabular-nums", c.sinal === "-" && "text-destructive")}>
                    {c.sinal === "-" ? `(${formatBRL(c.valor)})` : formatBRL(c.valor)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-card rounded-lg border p-4">
          <h2 className="mb-3 text-sm font-semibold">Funil por etapa do Kanban</h2>
          <div className="space-y-2">
            {porEtapa.map(({ e, s }) => (
              <div key={e.id} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span className="flex items-center gap-2"><span className={cn("h-2.5 w-2.5 rounded-full", corEtapa(e.cor).className)} />{e.descricao}</span>
                  <span className="tabular-nums">{s.quantidade} • {formatBRL(s.liquido)} • {pct(s.margem)}</span>
                </div>
                <div className="bg-muted mt-1 h-2 rounded">
                  <div className={cn("h-2 rounded", corEtapa(e.cor).className)} style={{ width: `${(s.liquido / maxEtapa) * 100}%` }} />
                </div>
              </div>
            ))}
            {!porEtapa.length && <p className="text-muted-foreground text-sm">Sem etapas configuradas.</p>}
          </div>
        </section>

        <section className="bg-card rounded-lg border p-4">
          <h2 className="mb-3 text-sm font-semibold">Rentabilidade por vendedor</h2>
          <div className="space-y-2">
            {porVendedor.map(({ id, s }) => (
              <div key={id || "sem"} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span>{id ? nome(usuarios, id) : "Sem vendedor"}</span>
                  <span className="tabular-nums">{formatBRL(s.resultado)} <span className={cn("ml-1 rounded px-1.5 py-0.5 text-xs", FAROL[farolMargem(s.margem)])}>{pct(s.margem)}</span></span>
                </div>
                <div className="bg-muted mt-1 h-2 rounded">
                  <div className="bg-primary h-2 rounded" style={{ width: `${(Math.abs(s.liquido) / maxVend) * 100}%` }} />
                </div>
              </div>
            ))}
            {!porVendedor.length && <p className="text-muted-foreground text-sm">Nenhuma oferta no filtro.</p>}
          </div>
        </section>

        <section className="bg-card rounded-lg border p-4">
          <h2 className="mb-3 text-sm font-semibold">Composição das despesas operacionais</h2>
          <div className="space-y-2">
            {despCat.map(([cat, v]) => (
              <div key={cat} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span>{categoriaDespesaLabel(cat)}</span>
                  <span className="tabular-nums">{formatBRL(v)} • {tot.despesas > 0 ? pct((v / tot.despesas) * 100) : "—"}</span>
                </div>
                <div className="bg-muted mt-1 h-2 rounded">
                  <div className="bg-warning h-2 rounded" style={{ width: `${tot.despesas > 0 ? (v / tot.despesas) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
            {!despCat.length && <p className="text-muted-foreground text-sm">Nenhuma despesa lançada.</p>}
          </div>
        </section>
      </div>

      <section className="bg-card overflow-x-auto rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Top 10 projetos</h2>
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-left text-xs">
            <tr><th className="py-1.5">Oferta</th><th>Cliente</th><th>Vendedor</th><th>Situação</th><th className="text-right">Receita</th><th className="text-right">Resultado</th><th className="text-right">Margem</th></tr>
          </thead>
          <tbody>
            {top.map(({ o, l }) => (
              <tr key={l.id} className="border-t">
                <td className="py-1.5 font-medium">{String(o["numero"] ?? "—")}</td>
                <td>{nome(parceiros, o["parceiro_id"])}</td>
                <td>{nome(usuarios, o["usuario_id"])}</td>
                <td><SituacaoBadge value={etapaDe(o)?.descricao ?? o["situacao"]} cor={etapaDe(o)?.cor} /></td>
                <td className="text-right tabular-nums">{formatBRL(l.liquido)}</td>
                <td className="text-right tabular-nums">{formatBRL(l.resultado)}</td>
                <td className="text-right"><span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", FAROL[farolMargem(l.margem)])}>{pct(l.margem)}</span></td>
              </tr>
            ))}
            {!top.length && <tr><td colSpan={7} className="text-muted-foreground py-4 text-center">Nenhuma oferta no filtro.</td></tr>}
          </tbody>
        </table>
        <p className="text-muted-foreground mt-3 text-xs">Farol: verde ≥ 30% • amarelo 15–30% • vermelho &lt; 15%. Comissões só contam quando o papel tem beneficiário.</p>
      </section>
    </div>
  );
}

function Kpi({ titulo, valor, sub }: { titulo: string; valor: string; sub?: React.ReactNode }) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <p className="text-muted-foreground text-xs">{titulo}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{valor}</p>
      {sub && <div className="text-muted-foreground mt-1 text-xs">{sub}</div>}
    </div>
  );
}
