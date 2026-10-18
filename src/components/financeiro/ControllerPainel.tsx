import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, BrainCircuit, CheckCircle2, Loader2, Printer, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTableRows, rowId, text } from "@/lib/crud";
import { formatBRL, num } from "@/lib/orcamentos";
import { diagnosticar, type NivelAlerta } from "@/lib/controller";
import { parecerController } from "@/lib/controller.functions";
import { supabase } from "@/integrations/supabase/client";
import type { Row } from "@/lib/row";
import { cn } from "@/lib/utils";

const SALDO_KEY = "controller_saldo";
const NIVEL: Record<NivelAlerta, { cls: string; Icon: typeof AlertTriangle }> = {
  critico: { cls: "border-destructive/40 bg-destructive/10 text-destructive", Icon: ShieldAlert },
  atencao: { cls: "border-warning/40 bg-warning/10 text-warning", Icon: AlertTriangle },
  ok: { cls: "border-success/40 bg-success/10 text-success", Icon: CheckCircle2 },
};

function Markdown({ texto }: { texto: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {texto.split("\n").map((l, i) => {
        const t = l.trim();
        if (!t) return <div key={i} className="h-1" />;
        const limpo = t.replace(/\*\*(.+?)\*\*/g, "$1");
        if (t.startsWith("#")) return <h3 key={i} className="pt-3 text-base font-semibold text-foreground">{limpo.replace(/^#+\s*/, "")}</h3>;
        return <p key={i} className={cn(/^(\d+\.|[-*])\s/.test(t) && "pl-3")}>{limpo.replace(/^[-*]\s/, "• ")}</p>;
      })}
    </div>
  );
}

export function ControllerPainel({ titulos }: { titulos: Row[] }) {
  const { data: parceiros = [] } = useTableRows("parceiros");
  const nomes = useMemo(() => new Map(parceiros.map((p) => [text(rowId(p)), text(p["nome_fantasia"] || p["razao_social"])])), [parceiros]);
  const [saldo, setSaldo] = useState("");
  useEffect(() => setSaldo(localStorage.getItem(SALDO_KEY) ?? ""), []);
  const d = useMemo(() => diagnosticar(titulos, num(saldo), (t) => nomes.get(text(t["parceiro_id"])) ?? ""), [titulos, saldo, nomes]);
  const gerar = useServerFn(parecerController);
  const [parecer, setParecer] = useState("");
  const [carregando, setCarregando] = useState(false);

  const pedirParecer = async () => {
    setCarregando(true);
    try {
      const { alertas, ...ind } = d;
      const { data: ses } = await supabase.auth.getSession();
      const token = ses.session?.access_token;
      if (!token) { toast.error("Sessão expirada. Entre novamente."); return; }
      const r = await gerar({ data: { token, resumo: JSON.stringify({ ...ind, alertas: alertas.map((a) => `${a.titulo}: ${a.detalhe}`) }) } });
      if (r.erro) toast.error(r.erro); else setParecer(r.texto);
    } catch {
      toast.error("Não foi possível gerar o parecer agora.");
    } finally {
      setCarregando(false);
    }
  };

  const kpis = [
    { label: "Fôlego de caixa", valor: d.runway === null ? "—" : `${d.runway.toLocaleString("pt-BR")} meses` },
    { label: "Despesa média mensal", valor: formatBRL(d.burn) },
    { label: "A receber (30 dias)", valor: formatBRL(d.aReceber30) },
    { label: "A pagar (30 dias)", valor: formatBRL(d.aPagar30) },
    { label: "Em atraso a receber", valor: formatBRL(d.inadimplencia.total) },
    { label: "Prazo médio receber / pagar", valor: `${d.pmr ?? "—"} / ${d.pmp ?? "—"} dias` },
  ];

  return (
    <div className="space-y-5 print-area">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Label>Saldo em caixa hoje (R$)</Label>
          <Input className="w-56" inputMode="decimal" value={saldo} placeholder="0,00"
            onChange={(e) => { setSaldo(e.target.value); localStorage.setItem(SALDO_KEY, e.target.value); }} />
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Relatório gerencial</Button>
          <Button onClick={pedirParecer} disabled={carregando}>
            {carregando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
            Parecer do Controller
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="mt-1 text-xl font-semibold">{k.valor}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Radar do Controller</h2>
        {d.alertas.map((a) => {
          const { cls, Icon } = NIVEL[a.nivel];
          return (
            <div key={a.id} className={cn("flex gap-3 rounded-lg border p-3", cls)}>
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <div><p className="font-medium">{a.titulo}</p><p className="text-sm text-foreground/80">{a.detalhe}</p></div>
            </div>
          );
        })}
      </div>

      {d.categorias.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 text-sm font-semibold">Despesas acima da média (mês atual x 3 meses anteriores)</h2>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground"><tr><th className="text-left">Categoria</th><th className="text-right">Mês atual</th><th className="text-right">Média</th><th className="text-right">Variação</th></tr></thead>
            <tbody>{d.categorias.map((c) => (
              <tr key={c.categoria} className="border-t"><td className="py-1">{c.categoria}</td><td className="text-right">{formatBRL(c.atual)}</td><td className="text-right">{formatBRL(c.media)}</td><td className="text-right text-warning">+{Math.round(c.variacao * 100)}%</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {parecer && (
        <div className="rounded-lg border bg-card p-5">
          <div className="mb-1 flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-primary" /><h2 className="font-semibold">Parecer do Controller</h2></div>
          <p className="mb-2 text-xs text-muted-foreground">Gerado por IA a partir dos indicadores acima em {new Date().toLocaleString("pt-BR")}. Confira antes de decidir.</p>
          <Markdown texto={parecer} />
        </div>
      )}
    </div>
  );
}
