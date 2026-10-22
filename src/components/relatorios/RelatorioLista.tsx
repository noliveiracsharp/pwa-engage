import type { ReactNode } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { imprimirDre } from "@/components/relatorios/DreRelatorioPDF";
import { useEmpresaAtiva } from "@/hooks/useEmpresaAtiva";

export type ColunaRel<T> = { header: string; cell: (r: T) => ReactNode; right?: boolean };

/** Relatório de listagem no layout padrão (.dre-doc, A4, impressão sem popup). */
export function RelatorioLista<T>({ titulo, rotulo, rows, filtros, kpis, colunas, chave, onClose }: {
  titulo: string; rotulo: string; rows: T[]; filtros: string[];
  kpis: { label: string; valor: ReactNode; sub?: string }[];
  colunas: ColunaRel<T>[]; chave: (r: T, i: number) => string; onClose: () => void;
}) {
  const emp = useEmpresaAtiva();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-5xl">
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        <div className="overflow-auto rounded border">
          <div id="dre-print" className="dre-doc p-4">
            <header className="dre-head">
              <div className="dre-emp">
                {emp.logo && <img src={String(emp.logo)} alt="" data-no-zoom />}
                <div>
                  <div className="dre-emp-nome">{emp.nome}</div>
                  <div className="dre-rot">{rotulo} • Confidencial</div>
                </div>
              </div>
              <div className="dre-head-dir"><div className="dre-rot">Emitido em</div><div>{new Date().toLocaleString("pt-BR")}</div></div>
            </header>
            <div className="dre-titulo">
              <h1>{titulo}</h1>
              <p>{rows.length} registro(s) • {filtros.join(" • ") || "Sem filtros"}</p>
            </div>
            <table className="dre-kpis"><tbody><tr>
              {kpis.map((k, i) => (
                <td key={k.label} className={i === kpis.length - 1 ? "dre-kpi-res" : ""}><span>{k.label}</span><strong>{k.valor}</strong>{k.sub && <small>{k.sub}</small>}</td>
              ))}
            </tr></tbody></table>
            <h2>1. Registros</h2>
            <table className="dre-tab">
              <thead><tr>{colunas.map((c) => <th key={c.header} className={c.right ? "r" : undefined}>{c.header}</th>)}</tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={chave(r, i)}>{colunas.map((c) => <td key={c.header} className={c.right ? "r" : undefined}>{c.cell(r)}</td>)}</tr>
                ))}
                {!rows.length && <tr><td colSpan={colunas.length}>Nenhum registro encontrado.</td></tr>}
                <tr className="tot"><td colSpan={colunas.length}>Total • {rows.length} registro(s)</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Fechar</Button><Button onClick={imprimirDre}><FileText className="mr-1 h-4 w-4" />Imprimir / PDF</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
