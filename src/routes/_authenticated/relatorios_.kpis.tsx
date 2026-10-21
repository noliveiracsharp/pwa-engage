import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTableRows } from "@/lib/crud";
import { formatBRL } from "@/lib/orcamentos";
import { hojeISO } from "@/lib/financeiro";
import { useEmpresaAtiva } from "@/hooks/useEmpresaAtiva";
import { farol } from "@/lib/board";
import { cac, operacao, payback, recorrencia, vendas } from "@/lib/kpis";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/relatorios_/kpis")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Cockpit de KPIs — Atende.ai" },
      { name: "description", content: "Indicadores de recorrência, vendas e operação de campo: MRR, churn, LTV, CAC, payback, SLA e FCR." },
      { property: "og:title", content: "Cockpit de KPIs — Atende.ai" },
      { property: "og:description", content: "Indicadores de recorrência, vendas e operação de campo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KpisPage,
});

const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const x = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}×`;
const FAROL = { verde: "border-l-success", amarelo: "border-l-warning", vermelho: "border-l-destructive" } as const;
type Cor = keyof typeof FAROL;
type K = { t: string; v: string; s?: string; c?: Cor };

const PERIODOS = [{ m: 1, l: "Mês atual" }, { m: 3, l: "3 meses" }, { m: 6, l: "6 meses" }, { m: 12, l: "12 meses" }];
function inicio(meses: number) { const d = new Date(); d.setMonth(d.getMonth() - (meses - 1), 1); return d.toISOString().slice(0, 10); }

function KpisPage() {
  const emp = useEmpresaAtiva();
  const { data: titulos = [] } = useTableRows("financeiro_titulos");
  const { data: orcs = [] } = useTableRows("orcamentos");
  const { data: os = [] } = useTableRows("manutencao_os");
  const [desde, setDesde] = useState(inicio(6));
  const [ate, setAte] = useState(hojeISO());

  const blocos = useMemo(() => {
    const r = recorrencia(orcs, desde, ate);
    const v = vendas(orcs, desde, ate);
    const c = cac(titulos, orcs, desde, ate);
    const relacao = c.valor > 0 ? r.ltv / c.valor : 0;
    const pb = payback(c.valor, v.margemImpl, v.ticketMensal || r.ticket);
    const o = operacao(os, desde, ate);
    const b1: K[] = [
      { t: "MRR atual", v: formatBRL(r.mrr), s: `${r.contratos} contratos • ${r.clientes} clientes`, c: farol(r.mrr, 1, 0) },
      { t: "ARR projetado", v: formatBRL(r.arr), s: "MRR × 12" },
      { t: "Ticket médio mensal", v: formatBRL(r.ticket), s: "Por contrato ativo" },
      { t: "Churn mensal", v: pct(r.churn), s: `${r.cancelados} encerrados • ${formatBRL(r.mrrPerdido)}/mês`, c: farol(r.churn, 1, 2.5, true) },
      { t: "LTV médio", v: formatBRL(r.ltv), s: r.churn > 0 ? "Ticket ÷ churn" : "Sem churn: 60 meses" },
    ];
    const b2: K[] = [
      { t: "CAC médio", v: formatBRL(c.valor), s: `${formatBRL(c.gasto)} ÷ ${c.novos} novos clientes` },
      { t: "Relação LTV / CAC", v: c.valor ? x(relacao) : "—", s: "Meta: 3× ou mais", c: c.valor ? farol(relacao, 3, 1.5) : undefined },
      { t: "Payback do CAC", v: !c.valor ? "—" : pb === 0 ? "Imediato" : Number.isFinite(pb) ? `${pb.toLocaleString("pt-BR")} meses` : "Sem retorno", s: "Implantação + mensalidade", c: c.valor ? (pb <= 1 ? "verde" : pb <= 12 ? "amarelo" : "vermelho") : undefined },
      { t: "Taxa de conversão", v: pct(v.conversao), s: `${v.ganhas} ganhas • ${v.perdidas} perdidas`, c: farol(v.conversao, 30, 15) },
      { t: "Ticket médio implantação", v: formatBRL(v.ticketImpl), s: `+ ${formatBRL(v.ticketMensal)}/mês` },
      { t: "Ciclo de fechamento", v: `${v.ciclo} dias`, s: "Criação até o ganho" },
    ];
    const b3: K[] = [
      { t: "Ordens de serviço", v: String(o.total), s: `${o.preventivas} preventivas • ${o.corretivas} corretivas` },
      { t: "Tempo médio de resolução", v: `${o.slaHoras.toLocaleString("pt-BR")} h`, s: `${o.concluidas} concluídas` },
      { t: "Dentro do prazo (SLA)", v: pct(o.noPrazo), s: "Concluídas no prazo", c: o.concluidas ? farol(o.noPrazo, 90, 75) : undefined },
      { t: "Resolução na 1ª visita (FCR)", v: pct(o.fcr), s: "Corretivas sem retorno em 30 dias", c: o.corretivas ? farol(o.fcr, 85, 70) : undefined },
    ];
    return [
      { n: "1. Recorrência (SaaS e monitoramento)", k: b1 },
      { n: "2. Vendas, projetos e aquisição", k: b2 },
      { n: "3. Operação de campo e manutenção", k: b3 },
    ];
  }, [orcs, titulos, os, desde, ate]);

  const dt = (s: string) => new Date(s + "T12:00").toLocaleDateString("pt-BR");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild><Link to="/relatorios" aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <h1 className="text-2xl font-bold text-foreground">Cockpit de KPIs</h1>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {PERIODOS.map((p) => (
            <Button key={p.m} size="sm" variant={desde === inicio(p.m) && ate === hojeISO() ? "default" : "outline"} onClick={() => { setDesde(inicio(p.m)); setAte(hojeISO()); }}>{p.l}</Button>
          ))}
          <div><Label className="text-xs">De</Label><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div><Label className="text-xs">Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
          <Button onClick={imprimir}><Printer className="mr-1 h-4 w-4" /> Imprimir / PDF</Button>
        </div>
      </div>

      {blocos.map((b) => (
        <section key={b.n} className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 font-semibold text-foreground">{b.n}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {b.k.map((k) => (
              <div key={k.t} className={cn("rounded-md border border-l-4 bg-background p-3", k.c ? FAROL[k.c] : "border-l-border")}>
                <div className="text-xs text-muted-foreground">{k.t}</div>
                <div className="text-lg font-bold tabular-nums text-foreground">{k.v}</div>
                {k.s && <div className="text-[11px] text-muted-foreground">{k.s}</div>}
              </div>
            ))}
          </div>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">CAC considera despesas pagas com categoria de Marketing, Comercial, Vendas, Anúncios, Tráfego, Publicidade ou Comissões. Churn usa a data de encerramento do contrato.</p>

      <div className="dre-print-src" aria-hidden>
        <div id="kpis-print" className="dre-doc">
          <header className="dre-head">
            <div className="dre-emp">
              {emp.logo && <img src={String(emp.logo)} alt="" data-no-zoom />}
              <div><div className="dre-emp-nome">{emp.nome}</div><div className="dre-rot">Relatório executivo • Confidencial</div></div>
            </div>
            <div className="dre-head-dir"><div className="dre-rot">Emitido em</div><div>{new Date().toLocaleString("pt-BR")}</div></div>
          </header>
          <div className="dre-titulo"><h1>Cockpit de KPIs</h1><p>Período de {dt(desde)} a {dt(ate)}</p></div>
          <table className="dre-kpis"><tbody><tr>
            {[blocos[0]!.k[0]!, blocos[0]!.k[3]!, blocos[0]!.k[4]!, blocos[1]!.k[0]!, blocos[1]!.k[1]!, blocos[2]!.k[3]!].map((k) => (
              <td key={k.t}><span>{k.t}</span><strong>{k.v}</strong>{k.s && <small>{k.s}</small>}</td>
            ))}
          </tr></tbody></table>
          {blocos.map((b) => (
            <div key={b.n}>
              <h2>{b.n}</h2>
              <table className="dre-tab">
                <thead><tr><th>Indicador</th><th className="num">Valor</th><th>Detalhe</th></tr></thead>
                <tbody>{b.k.map((k) => <tr key={k.t}><td>{k.t}</td><td className="num">{k.v}</td><td>{k.s ?? ""}</td></tr>)}</tbody>
              </table>
            </div>
          ))}
          <footer className="dre-rodape">Indicadores calculados a partir de ofertas, financeiro e ordens de serviço do sistema. Documento de uso interno.</footer>
        </div>
      </div>
    </div>
  );
}

function imprimir() {
  const src = document.getElementById("kpis-print");
  if (!src) return;
  const host = document.createElement("div");
  host.className = "dre-print-host";
  host.appendChild(src.cloneNode(true));
  document.body.appendChild(host);
  document.documentElement.classList.add("dre-printing");
  const limpar = () => { document.documentElement.classList.remove("dre-printing"); host.remove(); window.removeEventListener("afterprint", limpar); };
  window.addEventListener("afterprint", limpar);
  const imgs = Array.from(host.querySelectorAll("img"));
  Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })))).then(() => setTimeout(() => window.print(), 50));
}
