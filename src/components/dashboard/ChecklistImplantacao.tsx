import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Rocket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useTableRows } from "@/lib/crud";
import { useAudit } from "@/lib/audit";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { passosImplantacao, progressoImplantacao } from "@/lib/implantacao";
import { cn } from "@/lib/utils";

/** Card "Primeiros passos" do Dashboard — só para quem administra a empresa. */
export function ChecklistImplantacao() {
  const admin = usePagePermissions("/empresas").canUpdate;
  const { empresaId } = useAudit();
  const chave = `atendeai:implantacao:${empresaId ?? "x"}`;
  const [dispensado, setDispensado] = useState(true);
  const [aberto, setAberto] = useState(true);
  useEffect(() => { setDispensado(localStorage.getItem(chave) === "1"); }, [chave]);

  const on = admin && !dispensado;
  const { data: empresas = [] } = useTableRows("empresas", on);
  const { data: instancias = [] } = useTableRows("empresas_instancias", on);
  const { data: usuarios = [] } = useTableRows("usuarios", on);
  const { data: itens = [] } = useTableRows("itens", on);
  const { data: parceiros = [] } = useTableRows("parceiros", on);
  const { data: contas = [] } = useTableRows("financeiro_contas_bancarias", on);
  const { data: ofertas = [] } = useTableRows("orcamentos", on);

  const passos = useMemo(() => passosImplantacao({
    empresa: empresas.find((e) => String(e["id"]) === String(empresaId)) ?? empresas[0],
    instancias, usuarios, itens, parceiros, contas, ofertas,
  }), [empresas, empresaId, instancias, usuarios, itens, parceiros, contas, ofertas]);
  const prog = progressoImplantacao(passos);

  if (!on) return null;
  const dispensar = () => { localStorage.setItem(chave, "1"); setDispensado(true); };

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Primeiros passos da sua empresa</CardTitle>
          <span className="text-sm text-muted-foreground">{prog.feitos} de {prog.total} • {prog.pct}%</span>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label={aberto ? "Recolher" : "Expandir"} onClick={() => setAberto(!aberto)}>
            {aberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Dispensar" title="Não mostrar mais" onClick={dispensar}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={prog.pct} />
        {aberto && (
          <ul className="grid gap-2 md:grid-cols-2">
            {passos.map((p) => (
              <li key={p.id} className={cn("flex items-center gap-3 rounded-md border border-border p-3", p.feito && "bg-muted/50")}>
                {p.feito ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", p.feito && "text-muted-foreground line-through")}>{p.titulo}</p>
                  <p className="text-xs text-muted-foreground">{p.descricao}</p>
                </div>
                {!p.feito && (
                  <Button size="sm" variant="outline" asChild>
                    <Link to={p.rota as "/dashboard"}>{p.acao}</Link>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {prog.pct === 100 && (
          <p className="text-sm text-success">Implantação concluída! Você já pode dispensar este quadro.</p>
        )}
      </CardContent>
    </Card>
  );
}
