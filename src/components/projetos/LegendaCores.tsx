import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { prioridadeClass, progressoCor } from "@/lib/projetos";

const PROGRESSO: Array<[number, string]> = [[0, "Não iniciado (0–24%)"], [25, "Iniciado (25–49%)"], [50, "Na metade (50–74%)"], [75, "Quase lá (75–99%)"], [100, "Concluído (100%)"]];
const PRIORIDADES = ["Urgente", "Alta", "Normal", "Baixa"];

/** Blocos da legenda de cores dos projetos (usado na tela interna e no link público). */
export function LegendaBlocos({ status = [] }: { status?: Array<{ nome: string; cor: string }> }) {
  return (
    <div className="grid gap-4 text-xs sm:grid-cols-3">
      <div className="space-y-1.5">
        <p className="font-semibold text-foreground">Progresso da barra</p>
        {PROGRESSO.map(([p, l]) => (
          <div key={p} className="flex items-center gap-2"><span className="h-3 w-6 rounded-sm" style={{ backgroundColor: progressoCor(p) }} /><span className="text-muted-foreground">{l}</span></div>
        ))}
      </div>
      <div className="space-y-1.5">
        <p className="font-semibold text-foreground">Prioridade</p>
        {PRIORIDADES.map((p) => (
          <div key={p} className="flex items-center gap-2"><span className={`h-3 w-6 rounded-sm ${prioridadeClass(p)}`} /><span className="text-muted-foreground">{p}</span></div>
        ))}
        <div className="flex items-center gap-2 pt-1"><span className="h-3 w-0.5 bg-destructive/70" /><span className="text-muted-foreground">Linha vermelha: hoje</span></div>
      </div>
      {status.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-semibold text-foreground">Status</p>
          {status.map((s) => (
            <div key={s.nome} className="flex items-center gap-2"><span className="h-3 w-6 rounded-sm border border-border" style={{ backgroundColor: s.cor || "transparent" }} /><span className="text-muted-foreground">{s.nome}</span></div>
          ))}
        </div>
      )}
    </div>
  );
}

export function LegendaCores({ status }: { status?: Array<{ nome: string; cor: string }> }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm"><Info className="mr-1 h-4 w-4" />Legenda</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,560px)]"><LegendaBlocos status={status} /></PopoverContent>
    </Popover>
  );
}
