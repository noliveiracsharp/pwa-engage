import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CORES_ETAPA, corEtapa } from "@/lib/kanban-cores";
import { cn } from "@/lib/utils";

export function EtapaCorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-sm font-medium">Cor da etapa · {corEtapa(value).label}</legend>
      <div className="flex flex-wrap gap-2">
        {CORES_ETAPA.map((cor) => (
          <Button key={cor.value} type="button" variant="outline" size="icon" aria-label={`Cor ${cor.label}`} aria-pressed={cor.value === value} title={cor.label}
            className={cn("h-9 w-9 shrink-0", value === cor.value && "ring-2 ring-ring ring-offset-2 ring-offset-background")}
            onClick={() => onChange(cor.value)}>
            <span className={cn("grid h-6 w-6 place-items-center rounded-full", cor.className)}>
              {value === cor.value && <Check className="h-4 w-4 text-background" />}
            </span>
          </Button>
        ))}
      </div>
    </fieldset>
  );
}