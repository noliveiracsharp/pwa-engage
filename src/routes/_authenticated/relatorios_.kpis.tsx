import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Info, Loader2, Printer, RefreshCw } from "lucide-react";
import { useFinanceiroRpc } from "@/lib/financeiro-rpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTableRows } from "@/lib/crud";
import { formatBRL } from "@/lib/orcamentos";
import { hojeISO } from "@/lib/financeiro";
import { useEmpresaAtiva } from "@/hooks/useEmpresaAtiva";
import { farol } from "@/lib/board";
import { cac, operacao, payback, vendas } from "@/lib/kpis";
import { recorrenciaRecebiveis } from "@/lib/kpis-recebiveis";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Explicação de cada indicador (ícone i). */
const INFO: Record<string, string> = {
  "MRR atual": "Monthly Recurring Revenue: soma dos títulos mensais a receber no mês da data final, pagos ou abertos, identificados pelo texto informado na categoria ou descrição. Inclui vencimentos posteriores à data final dentro desse mês; exclui cancelados. Não depende de Ofertas nem soma parcelas de outros meses.",
  "ARR projetado": "Annual Recurring Revenue: o MRR atual multiplicado por 12. Mostra quanto a recorrência gera em um ano se nada mudar.",
  "Ticket médio mensal": "MRR dividido pela quantidade de clientes distintos com mensalidade no mês final. Usa o cliente atendido quando disponível, senão o pagador. Vários títulos do mesmo cliente somam receita, mas contam um único cliente.",
  "Churn mensal": "Receita recorrente perdida por cancelamentos confirmados. Sem o histórico contratual da carteira migrada, não é possível calcular com segurança: a ausência de cobrança pode ser apenas falta de lançamento, não cancelamento.",
  "LTV médio": "Lifetime Value: receita estimada durante a relação com o cliente, não o tempo já transcorrido. Sem histórico confiável de cancelamentos, esta projeção usa ticket mensal × 60 meses; não representa duração contratual comprovada.",
  "CAC médio": "Custo de Aquisição de Cliente: despesas pagas de marketing, comercial, vendas, anúncios e comissões no período ÷ novos clientes ganhos.",
  "Relação LTV / CAC": "Quantas vezes o cliente devolve o que custou para conquistá-lo. Saudável: 3× ou mais.",
  "Payback do CAC": "Tempo para recuperar o CAC: primeiro com a margem da implantação, depois com as mensalidades. \"Imediato\" = a implantação já pagou a aquisição.",
  "Taxa de conversão": "Ofertas ganhas ÷ (ganhas + perdidas) no período.",
  "Ticket médio implantação": "Valor médio de implantação (produtos e serviços avulsos) das Ofertas ganhas, mais a mensalidade média.",
  "Ciclo de fechamento": "Média de dias entre a criação da Oferta e o ganho.",
  "Ordens de serviço": "Quantidade de OS abertas no período, separadas em preventivas e corretivas.",
  "Tempo médio de resolução": "Média de horas entre a abertura e a conclusão das OS concluídas.",
  "Dentro do prazo (SLA)": "Percentual das OS concluídas antes do prazo de SLA definido.",
  "Resolução na 1ª visita (FCR)": "First Call Resolution: corretivas que não tiveram nova corretiva no mesmo cliente/equipamento em até 30 dias.",
};

export const Route = createFileRoute("/_authenticated/relatorios_/kpis")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Cockpit de KPIs — ConectCon HUB" },
      { name: "description", content: "Indicadores de recorrência, vendas e operação de campo: MRR, churn, LTV, CAC, payback, SLA e FCR." },
      { property: "og:title", content: "Cockpit de KPIs — ConectCon HUB" },
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
type K = { t: string; v: string; s?: string | undefined; c?: Cor | undefined };

const PERIODOS = [{ m: 1, l: "Mês atual" }, { m: 3, l: "3 meses" }, { m: 6, l: "6 meses" }, { m: 12, l: "12 meses" }];
function inicio(meses: number) { const d = new Date(); d.setMonth(d.getMonth() - (meses - 1), 1); return d.toISOString().slice(0, 10); }

function KpisPage() {
  const emp = useEmpresaAtiva();
  const { data: orcs = [] } = useTableRows("orcamentos");
  const { data: os = [] } = useTableRows("manutencao_os");
  const { data: contas = [] } = useTableRows("plano_contas");
  const { data: centros = [] } = useTableRows("centro_custo");
  const [desdeEd, setDesde] = useState(inicio(6));
  const [ateEd, setAte] = useState(hojeISO());
  const [classificacaoEd, setClassificacao] = useState("Mensalidade");
  // Edição de filtros não dispara consultas; cada Processar também permite repetir o período.
  const [{ desde, ate, classificacao, rodada }, setAplicado] = useState({ desde: desdeEd, ate: ateEd, classificacao: classificacaoEd, rodada: 0 });
  const { data: titulos = [], isFetching: carregandoTitulos, error: erroTitulos } = useFinanceiroRpc("fn_financeiro_titulos_periodo", { p_de: desde, p_ate: ate }, rodada > 0, ["kpis-financeiro", rodada]);
  const { data: mensais, isFetching: carregandoMensais, error: erroMensais } = useFinanceiroRpc("fn_financeiro_recorrencia_mensal", { p_de: desde, p_ate: ate, p_classificacao: classificacao }, rodada > 0, ["kpis-recorrencia", rodada]);
  const processando = carregandoTitulos || carregandoMensais;
  const erro = erroMensais || erroTitulos;
  const recorrenciaDisponivel = rodada > 0 && !!mensais && !erroMensais && !carregandoMensais;

  const blocos = useMemo(() => {
    const r = recorrenciaRecebiveis(mensais ?? [], ate);
    const v = vendas(orcs, desde, ate);
    const nomes: Record<string, string> = {};
    for (const x of [...contas, ...centros]) nomes[String(x["id"])] = String(x["nome"] ?? x["descricao"] ?? "");
    const c = cac(titulos, orcs, desde, ate, nomes);
    const relacao = c.valor > 0 ? r.ltv / c.valor : 0;
    const pb = payback(c.valor, v.margemImpl, v.ticketMensal || r.ticket);
    const o = operacao(os, desde, ate);
    const b1: K[] = [
      { t: "MRR atual", v: recorrenciaDisponivel ? formatBRL(r.mrr) : "—", s: recorrenciaDisponivel ? `${r.clientes} clientes • Contas a Receber` : "Aguardando processamento", c: recorrenciaDisponivel ? farol(r.mrr, 1, 0) : undefined },
      { t: "ARR projetado", v: recorrenciaDisponivel ? formatBRL(r.arr) : "—", s: "MRR × 12" },
      { t: "Ticket médio mensal", v: recorrenciaDisponivel ? formatBRL(r.ticket) : "—", s: "Por cliente no mês final" },
      { t: "Churn mensal", v: "—", s: "Sem histórico de cancelamentos" },
      { t: "LTV médio", v: recorrenciaDisponivel ? formatBRL(r.ltv) : "—", s: "Estimativa: ticket × 60 meses" },
    ];
    const b2: K[] = [
      { t: "CAC médio", v: formatBRL(c.valor), s: `${formatBRL(c.gasto)} ÷ ${c.novos} novos clientes` },
      { t: "Relação LTV / CAC", v: c.valor && recorrenciaDisponivel ? x(relacao) : "—", s: "LTV estimado • meta ≥ 3×", c: c.valor && recorrenciaDisponivel ? farol(relacao, 3, 1.5) : undefined },
      { t: "Payback do CAC", v: !c.valor || !recorrenciaDisponivel ? "—" : pb === 0 ? "Imediato" : Number.isFinite(pb) ? `${pb.toLocaleString("pt-BR")} meses` : "Sem retorno", s: "Implantação + mensalidade", c: c.valor && recorrenciaDisponivel ? (pb <= 1 ? "verde" : pb <= 12 ? "amarelo" : "vermelho") : undefined },
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
  }, [orcs, titulos, mensais, recorrenciaDisponivel, os, contas, centros, desde, ate]);

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
            <Button key={p.m} size="sm" variant={desdeEd === inicio(p.m) && ateEd === hojeISO() ? "default" : "outline"} onClick={() => { setDesde(inicio(p.m)); setAte(hojeISO()); }}>{p.l}</Button>
          ))}
          <div><Label className="text-xs">De</Label><Input type="date" value={desdeEd} onChange={(e) => setDesde(e.target.value)} /></div>
          <div><Label className="text-xs">Até</Label><Input type="date" value={ateEd} onChange={(e) => setAte(e.target.value)} /></div>
          <div><Label htmlFor="kpis-mensalidade" className="text-xs">Identificação da mensalidade</Label><Input id="kpis-mensalidade" value={classificacaoEd} onChange={(e) => setClassificacao(e.target.value)} /></div>
          <Button variant="outline" disabled={processando || !desdeEd || !ateEd || desdeEd > ateEd || !classificacaoEd.trim()} onClick={() => setAplicado({ desde: desdeEd, ate: ateEd, classificacao: classificacaoEd.trim(), rodada: rodada + 1 })}>
            {processando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}Processar
          </Button>
          <Button onClick={imprimir}><Printer className="mr-1 h-4 w-4" /> Imprimir / PDF</Button>
        </div>
      </div>

      {erro && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">Não foi possível carregar os títulos: {(erro as Error).message}</p>}

      {blocos.map((b) => (
        <section key={b.n} className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 font-semibold text-foreground">{b.n}</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {b.k.map((k) => (
              <div key={k.t} className={cn("rounded-md border border-l-4 bg-background p-3", k.c ? FAROL[k.c] : "border-l-border")}>
                <div className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
                  <span>{k.t}</span>
                  {INFO[k.t] && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button type="button" aria-label={`O que é ${k.t}`} className="rounded-full p-0.5 hover:bg-muted hover:text-foreground print:hidden"><Info className="h-3.5 w-3.5" /></button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 text-sm">{INFO[k.t]}</PopoverContent>
                    </Popover>
                  )}
                </div>
                <div className="text-lg font-bold tabular-nums text-foreground">{k.v}</div>
                {k.s && <div className="text-[11px] text-muted-foreground">{k.s}</div>}
              </div>
            ))}
          </div>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">Recorrência: Contas a Receber • Identificação aplicada: {classificacao} • Mês de referência: {ate.slice(0, 7)}. Churn indisponível sem cancelamentos confirmados; LTV estimado em 60 meses.</p>

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
            {[blocos[0]?.k[0], blocos[0]?.k[3], blocos[0]?.k[4], blocos[1]?.k[0], blocos[1]?.k[1], blocos[2]?.k[3]].filter((k): k is K => !!k).map((k) => (
              <td key={k.t}><span>{k.t}</span><strong>{k.v}</strong>{k.s && <small>{k.s}</small>}</td>
            ))}
          </tr></tbody></table>
          {erro && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">Não foi possível carregar os títulos: {(erro as Error).message}</p>}

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
