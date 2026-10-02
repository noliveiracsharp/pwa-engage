import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { pick, type Row } from "@/lib/row";
import { fmtDate, tarefaPct } from "@/lib/projetos";

const PRIO: Record<string, string> = { urg: "#dc2626", alt: "#eab308", baix: "#94a3b8" };
const prioHex = (p: unknown) => {
  const v = String(p ?? "").toLowerCase();
  return Object.entries(PRIO).find(([k]) => v.startsWith(k))?.[1] ?? "#3b82f6";
};
const progHex = (n: number) => (n >= 100 ? "#22c55e" : n >= 75 ? "#14b8a6" : n >= 50 ? "#3b82f6" : n >= 25 ? "#38bdf8" : "#94a3b8");
const toTime = (v: unknown) => (v ? new Date(String(v).slice(0, 10) + "T00:00:00").getTime() : NaN);

type Props = {
  projeto: Row;
  cliente: string;
  periodo: string;
  tarefas: Row[];
  cols: { nome: string; ini: string; fim: string; prio: string; resp: string; done: string };
  usuarios: Row[];
  empresaId?: unknown;
  pct: number;
};

/** Documento do Gantt exibido somente na impressão (paisagem). */
export function ProjetoPrint({ projeto, cliente, periodo, tarefas, cols, usuarios, empresaId, pct }: Props) {
  const [empresa, setEmpresa] = useState<Row | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.createElement("div");
    el.className = "prj-print-host";
    document.body.appendChild(el);
    setHost(el);
    return () => { el.remove(); };
  }, []);

  useEffect(() => {
    const id = projeto["empresa_id"] ?? empresaId;
    if (!id) return;
    supabase.from("empresas").select("*").eq("id", id as never).maybeSingle()
      .then(({ data }) => setEmpresa((data as Row) ?? null));
  }, [projeto, empresaId]);

  if (!host) return null;

  const empNome = empresa ? String(pick(empresa, ["nome_fantasia", "razao_social", "nome"]) ?? "") : "";
  const logo = empresa ? (pick(empresa, ["logo", "logo_url", "logotipo", "imagem"]) as string | undefined) : undefined;

  const tempos = tarefas.flatMap((t) => [toTime(t[cols.ini]), toTime(t[cols.fim])]).filter((n) => !isNaN(n));
  const min = tempos.length ? Math.min(...tempos) : Date.now();
  const max = tempos.length ? Math.max(...tempos) + 86400000 : Date.now() + 86400000;
  const span = Math.max(max - min, 86400000);
  const hoje = Date.now();
  const meses: { left: number; label: string }[] = [];
  const m = new Date(min); m.setDate(1);
  while (m.getTime() < max) {
    const l = ((m.getTime() - min) / span) * 100;
    if (l >= 0) meses.push({ left: l, label: m.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }) });
    m.setMonth(m.getMonth() + 1);
  }

  return createPortal(
    <div className="prj-doc">
      <header className="prj-head">
        <div className="prj-emp">
          {logo && <img src={logo} alt={empNome} />}
          <div>
            {empNome && <div className="prj-emp-nome">{empNome}</div>}
            <div className="prj-rot">Cronograma do projeto</div>
          </div>
        </div>
        <div className="prj-ger">Gerado em {new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</div>
      </header>
      <section className="prj-info">
        <h1>{String(pick(projeto, ["nome", "descricao", "titulo"]) ?? "Projeto")}</h1>
        <div><b>Cliente:</b> {cliente}{periodo && <> · <b>Período:</b> {periodo}</>} · <b>Andamento:</b> {pct}%</div>
      </section>
      <div className="prj-gantt">
        <div className="prj-row prj-row-head">
          <div className="prj-cell-nome">Tarefa</div>
          <div className="prj-cell-resp">Responsável</div>
          <div className="prj-cell-dt">Período</div>
          <div className="prj-track">
            {meses.map((x) => <span key={x.left} className="prj-mes" style={{ left: `${x.left}%` }}>{x.label}</span>)}
          </div>
        </div>
        {tarefas.map((t, i) => {
          const a = toTime(t[cols.ini]); const b = toTime(t[cols.fim]);
          const ini = isNaN(a) ? b : a; const fim = isNaN(b) ? a : b;
          const p = tarefaPct(t, cols.done);
          const resp = usuarios.find((u) => String(pick(u, ["id", "usuario_id"])) === String(t[cols.resp]));
          return (
            <div key={i} className="prj-row">
              <div className="prj-cell-nome">{String(t[cols.nome] ?? "")}</div>
              <div className="prj-cell-resp">{resp ? String(pick(resp, ["nome", "email"]) ?? "—") : "—"}</div>
              <div className="prj-cell-dt">{fmtDate(t[cols.ini])} – {fmtDate(t[cols.fim])}</div>
              <div className="prj-track">
                {meses.map((x) => <span key={x.left} className="prj-grid" style={{ left: `${x.left}%` }} />)}
                {hoje >= min && hoje <= max && <span className="prj-hoje" style={{ left: `${((hoje - min) / span) * 100}%` }} />}
                {!isNaN(ini) && (
                  <div className="prj-bar" style={{
                    left: `${((ini - min) / span) * 100}%`,
                    width: `${Math.max(((fim + 86400000 - ini) / span) * 100, 1.5)}%`,
                    borderLeftColor: prioHex(t[cols.prio]),
                  }}>
                    <div className="prj-bar-fill" style={{ width: `${p}%`, background: progHex(p) }} />
                    <span>{p}%</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {tarefas.length === 0 && <div className="prj-vazio">Nenhuma tarefa neste projeto.</div>}
      </div>
      <footer className="prj-leg">
        <span><i style={{ background: "#94a3b8" }} />0%</span><span><i style={{ background: "#38bdf8" }} />25%</span>
        <span><i style={{ background: "#3b82f6" }} />50%</span><span><i style={{ background: "#14b8a6" }} />75%</span>
        <span><i style={{ background: "#22c55e" }} />100%</span>
        <span className="prj-leg-sep">Borda esquerda = prioridade:</span>
        <span><i style={{ background: "#dc2626" }} />Urgente</span><span><i style={{ background: "#eab308" }} />Alta</span>
        <span><i style={{ background: "#3b82f6" }} />Normal</span><span><i style={{ background: "#94a3b8" }} />Baixa</span>
      </footer>
    </div>,
    host,
  );
}
