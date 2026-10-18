import { formatBRL } from "@/lib/orcamentos";
import type { diagnosticar } from "@/lib/controller";

type Diag = ReturnType<typeof diagnosticar>;
const NIVEL_TXT = { critico: "Crítico", atencao: "Atenção", ok: "OK" } as const;

/** Relatório gerencial A4 do Controller — só aparece na impressão (usa o layout dre-doc). */
export function ControllerRelatorioDocumento({ empresa, d, saldo, parecer }: {
  empresa: { nome: string; logo?: string }; d: Diag; saldo: number; parecer: string;
}) {
  const kpis: [string, string][] = [
    ["Saldo em caixa", formatBRL(saldo)],
    ["Fôlego de caixa", d.runway === null ? "—" : `${d.runway.toLocaleString("pt-BR")} meses`],
    ["Despesa média mensal", formatBRL(d.burn)],
    ["A receber (30 dias)", formatBRL(d.aReceber30)],
    ["A pagar (30 dias)", formatBRL(d.aPagar30)],
    ["Em atraso a receber", formatBRL(d.inadimplencia.total)],
    ["Prazo médio receber / pagar", `${d.pmr ?? "—"} / ${d.pmp ?? "—"} dias`],
  ];
  return (
    <div id="dre-print" className="dre-doc">
      <header className="dre-head">
        <div className="dre-emp">
          {empresa.logo && <img src={empresa.logo} alt="" data-no-zoom />}
          <div>
            <div className="dre-emp-nome">{empresa.nome}</div>
            <div className="dre-rot">Relatório gerencial • Confidencial</div>
          </div>
        </div>
        <div className="dre-head-dir">
          <div className="dre-rot">Emitido em</div>
          <div>{new Date().toLocaleString("pt-BR")}</div>
        </div>
      </header>

      <div className="dre-titulo">
        <h1>Controladoria Financeira — Relatório Gerencial</h1>
        <p>Indicadores de caixa, alertas e plano de ação</p>
      </div>

      <h2>1. Indicadores</h2>
      <table className="dre-tab">
        <tbody>{kpis.map(([l, v]) => <tr key={l}><td>{l}</td><td className="r">{v}</td></tr>)}</tbody>
      </table>

      <h2>2. Radar do Controller</h2>
      <table className="dre-tab">
        <thead><tr><th>Nível</th><th>Alerta</th><th>Detalhe</th></tr></thead>
        <tbody>
          {d.alertas.map((a) => <tr key={a.id}><td>{NIVEL_TXT[a.nivel]}</td><td>{a.titulo}</td><td>{a.detalhe}</td></tr>)}
          {!d.alertas.length && <tr><td colSpan={3}>Nenhum alerta.</td></tr>}
        </tbody>
      </table>

      {d.categorias.length > 0 && (
        <>
          <h2>3. Despesas acima da média</h2>
          <table className="dre-tab">
            <thead><tr><th>Categoria</th><th className="r">Mês atual</th><th className="r">Média 3 meses</th><th className="r">Variação</th></tr></thead>
            <tbody>{d.categorias.map((c) => (
              <tr key={c.categoria}><td>{c.categoria}</td><td className="r">{formatBRL(c.atual)}</td><td className="r">{formatBRL(c.media)}</td><td className="r neg">+{Math.round(c.variacao * 100)}%</td></tr>
            ))}</tbody>
          </table>
        </>
      )}

      <h2>{d.categorias.length > 0 ? "4" : "3"}. Parecer do Controller</h2>
      {parecer ? (
        <div>
          {parecer.split("\n").map((l, i) => {
            const t = l.trim().replace(/\*\*(.+?)\*\*/g, "$1");
            if (!t) return null;
            if (t.startsWith("#")) return <h3 key={i} style={{ margin: "10px 0 4px", fontSize: 12.5, fontWeight: 700 }}>{t.replace(/^#+\s*/, "")}</h3>;
            return <p key={i} style={{ margin: "2px 0" }}>{t.replace(/^[-*]\s/, "• ")}</p>;
          })}
          <p style={{ marginTop: 8, fontSize: 10, opacity: 0.7 }}>Gerado por IA a partir dos indicadores acima. Confira antes de decidir.</p>
        </div>
      ) : (
        <p>Parecer não gerado. Clique em "Parecer do Controller" antes de imprimir para incluí-lo.</p>
      )}
    </div>
  );
}
