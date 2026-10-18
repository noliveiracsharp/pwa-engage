import { formatBRL, categoriaDespesaLabel } from "@/lib/orcamentos";
import type { DreLinha } from "@/lib/dre-ofertas";
import type { MesCaixa } from "@/lib/fluxo-caixa";
import { TabelaFluxo } from "@/components/relatorios/FluxoCaixaMensal";

type Soma = ReturnType<typeof import("@/lib/dre-ofertas").somarDre>;
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export type DreRelatorioProps = {
  empresa: { nome: string; logo?: string };
  periodo: string;
  filtros: string;
  tot: Soma;
  cascata: { label: string; valor: number; sinal: "+" | "-" | "=" }[];
  etapas: { nome: string; s: Soma }[];
  vendedores: { nome: string; s: Soma }[];
  despesas: [string, number][];
  fluxo?: MesCaixa[];
  projetos: { numero: string; cliente: string; vendedor: string; situacao: string; l: DreLinha }[];
};

/** Relatório gerencial formal (A4) do DRE de Ofertas — só aparece na impressão. */
export function DreRelatorioDocumento(p: DreRelatorioProps) {
  const t = p.tot;
  const emitido = new Date().toLocaleString("pt-BR");
  return (
    <div id="dre-print" className="dre-doc">
      <header className="dre-head">
        <div className="dre-emp">
          {p.empresa.logo && <img src={p.empresa.logo} alt="" data-no-zoom />}
          <div>
            <div className="dre-emp-nome">{p.empresa.nome}</div>
            <div className="dre-rot">Relatório gerencial • Confidencial</div>
          </div>
        </div>
        <div className="dre-head-dir">
          <div className="dre-rot">Emitido em</div>
          <div>{emitido}</div>
        </div>
      </header>

      <div className="dre-titulo">
        <h1>DRE de Ofertas — Demonstrativo de Resultado Previsto</h1>
        <p>{p.periodo} • {t.quantidade} ofertas • {p.filtros}</p>
      </div>

      <table className="dre-kpis">
        <tbody>
          <tr>
            <td><span>Receita líquida</span><strong>{formatBRL(t.liquido)}</strong><small>Ticket médio {formatBRL(t.ticketMedio)}</small></td>
            <td><span>Custo + impostos</span><strong>{formatBRL(t.custo + t.imposto)}</strong></td>
            <td><span>Despesas operacionais</span><strong>{formatBRL(t.despesas)}</strong></td>
            <td><span>Comissões previstas</span><strong>{formatBRL(t.comissoes)}</strong></td>
            <td className="dre-kpi-res"><span>Resultado previsto</span><strong>{formatBRL(t.resultado)}</strong><small>Margem {pct(t.margem)}</small></td>
          </tr>
        </tbody>
      </table>

      <h2>1. Demonstrativo de resultado</h2>
      <table className="dre-tab">
        <thead><tr><th>Conta</th><th className="r">Valor (R$)</th><th className="r">% s/ bruto</th></tr></thead>
        <tbody>
          {p.cascata.map((c) => (
            <tr key={c.label} className={c.sinal === "=" ? "tot" : ""}>
              <td>({c.sinal}) {c.label}</td>
              <td className={`r ${c.sinal === "-" ? "neg" : ""}`}>{c.sinal === "-" ? `(${formatBRL(c.valor)})` : formatBRL(c.valor)}</td>
              <td className="r">{t.bruto > 0 ? pct((c.valor / t.bruto) * 100) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>2. Funil por etapa do Kanban</h2>
      <table className="dre-tab">
        <thead><tr><th>Etapa</th><th className="r">Qtd.</th><th className="r">Receita líquida</th><th className="r">Resultado</th><th className="r">Margem</th></tr></thead>
        <tbody>
          {p.etapas.map((e) => (
            <tr key={e.nome}><td>{e.nome}</td><td className="r">{e.s.quantidade}</td><td className="r">{formatBRL(e.s.liquido)}</td><td className="r">{formatBRL(e.s.resultado)}</td><td className="r">{pct(e.s.margem)}</td></tr>
          ))}
          <tr className="tot"><td>Total</td><td className="r">{t.quantidade}</td><td className="r">{formatBRL(t.liquido)}</td><td className="r">{formatBRL(t.resultado)}</td><td className="r">{pct(t.margem)}</td></tr>
        </tbody>
      </table>

      <div className="dre-duas">
        <div>
          <h2>3. Rentabilidade por vendedor</h2>
          <table className="dre-tab">
            <thead><tr><th>Vendedor</th><th className="r">Receita</th><th className="r">Resultado</th><th className="r">Margem</th></tr></thead>
            <tbody>
              {p.vendedores.map((v) => (
                <tr key={v.nome}><td>{v.nome}</td><td className="r">{formatBRL(v.s.liquido)}</td><td className="r">{formatBRL(v.s.resultado)}</td><td className="r">{pct(v.s.margem)}</td></tr>
              ))}
              {!p.vendedores.length && <tr><td colSpan={4}>Nenhuma oferta.</td></tr>}
            </tbody>
          </table>
        </div>
        <div>
          <h2>4. Despesas operacionais</h2>
          <table className="dre-tab">
            <thead><tr><th>Categoria</th><th className="r">Valor</th><th className="r">%</th></tr></thead>
            <tbody>
              {p.despesas.map(([c, v]) => (
                <tr key={c}><td>{categoriaDespesaLabel(c)}</td><td className="r">{formatBRL(v)}</td><td className="r">{t.despesas > 0 ? pct((v / t.despesas) * 100) : "—"}</td></tr>
              ))}
              {!p.despesas.length && <tr><td colSpan={3}>Nenhuma despesa lançada.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <h2 className="dre-quebra">5. Detalhamento por oferta</h2>
      <table className="dre-tab dre-tab-mini">
        <thead>
          <tr><th>Oferta</th><th>Cliente</th><th>Vendedor</th><th>Situação</th><th className="r">Receita</th><th className="r">Custo</th><th className="r">Impostos</th><th className="r">Despesas</th><th className="r">Comissões</th><th className="r">Resultado</th><th className="r">Margem</th></tr>
        </thead>
        <tbody>
          {p.projetos.map(({ numero, cliente, vendedor, situacao, l }) => (
            <tr key={l.id}>
              <td>{numero}</td><td>{cliente}</td><td>{vendedor}</td><td>{situacao}</td>
              <td className="r">{formatBRL(l.liquido)}</td><td className="r">{formatBRL(l.custo)}</td><td className="r">{formatBRL(l.imposto)}</td>
              <td className="r">{formatBRL(l.despesas)}</td><td className="r">{formatBRL(l.comissoes)}</td>
              <td className={`r ${l.resultado < 0 ? "neg" : ""}`}>{formatBRL(l.resultado)}</td><td className="r">{pct(l.margem)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {p.fluxo && (
        <>
          <h2 className="dre-quebra">6. Fluxo de caixa projetado — mês a mês</h2>
          <TabelaFluxo meses={p.fluxo} print />
        </>
      )}

      <footer className="dre-rodape">
        Valores previstos com base na memória de cálculo gravada em cada oferta. Comissões consideradas apenas quando o papel possui beneficiário.
        Margem: saudável ≥ 30% • atenção 15–30% • crítica &lt; 15%. Documento de uso interno.
      </footer>
    </div>
  );
}

/** Clona o documento para fora do layout e imprime só ele. */
export function imprimirDre() {
  const src = document.getElementById("dre-print");
  if (!src) return;
  const host = document.createElement("div");
  host.className = "dre-print-host";
  host.appendChild(src.cloneNode(true));
  document.body.appendChild(host);
  document.documentElement.classList.add("dre-printing");
  const limpar = () => {
    document.documentElement.classList.remove("dre-printing");
    host.remove();
    window.removeEventListener("afterprint", limpar);
  };
  window.addEventListener("afterprint", limpar);
  const imgs = Array.from(host.querySelectorAll("img"));
  Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })))).then(() =>
    setTimeout(() => window.print(), 50),
  );
}
