import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { navegarPeriodo, periodoPreset, PRESETS_PERIODO, rotuloPeriodo, type Periodo } from "@/lib/periodo-vencimento";
import { cn } from "@/lib/utils";

export function PeriodoNavegavel({ label = "Vencimento", value, onChange }: { label?: string; value: Periodo; onChange: (p: Periodo) => void }) {
  const semSetas = value.preset === "todo";
  return (
    <div data-busca="1" className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-background flex items-center rounded-md border">
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-r-none" disabled={semSetas}
            aria-label="Período anterior" onClick={() => onChange(navegarPeriodo(value, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" className="h-9 min-w-44 rounded-none border-x font-medium" title="Clique aqui para selecionar outro período">
                {rotuloPeriodo(value)}<ChevronDown className="ml-1 h-4 w-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              {PRESETS_PERIODO.map((o) => (
                <DropdownMenuItem key={o.value} className={cn(value.preset === o.value && "bg-accent font-medium")}
                  onSelect={() => onChange(o.value === "personalizado" ? { preset: "personalizado", de: value.de || periodoPreset("mes").de, ate: value.ate || periodoPreset("mes").ate } : periodoPreset(o.value))}>
                  {o.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-l-none" disabled={semSetas}
            aria-label="Próximo período" onClick={() => onChange(navegarPeriodo(value, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        {value.preset === "personalizado" && (
          <>
            <Input type="date" className="w-40" aria-label="Data início" value={value.de} onChange={(e) => onChange({ ...value, de: e.target.value })} />
            <Input type="date" className="w-40" aria-label="Data fim" value={value.ate} onChange={(e) => onChange({ ...value, ate: e.target.value })} />
          </>
        )}
      </div>
    </div>
  );
}
