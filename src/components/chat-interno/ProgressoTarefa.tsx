import { FAIXAS_PROGRESSO } from "@/lib/planner";
import { progressoCor } from "@/lib/projetos";
import { cn } from "@/lib/utils";

/** Controle de progresso 0/25/50/75/100 com as cores de Projetos. */
export function ProgressoTarefa({ valor, onChange, disabled }: { valor: number; onChange: (p: number) => void; disabled?: boolean }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1" role="group" aria-label="Progresso da tarefa">
      <div className="mr-1 h-1.5 w-14 overflow-hidden rounded-full bg-muted"><div className="h-full" style={{ width: `${valor}%`, backgroundColor: progressoCor(valor) }} /></div>
      {FAIXAS_PROGRESSO.map((p) => {
        const ativo = valor === p;
        return (
          <button key={p} type="button" disabled={disabled} aria-pressed={ativo} aria-label={`Progresso ${p}%`}
            onClick={(e) => { e.stopPropagation(); onChange(p); }}
            className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-semibold disabled:opacity-50", ativo ? "text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted")}
            style={ativo ? { backgroundColor: progressoCor(p), borderColor: progressoCor(p) } : undefined}>{p}%</button>
        );
      })}
    </div>
  );
}
