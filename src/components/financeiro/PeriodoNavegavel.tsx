import { useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { navegarPeriodo, periodoPreset, PRESETS_PERIODO, rotuloPeriodo, type Periodo } from "@/lib/periodo-vencimento";
import { cn } from "@/lib/utils";

export function PeriodoNavegavel({ label = "Vencimento", value, onChange }: { label?: string; value: Periodo; onChange: (p: Periodo) => void }) {
  const semSetas = value.preset === "todo";
  const [aberto, setAberto] = useState(false);
  const [de, setDe] = useState(value.de);
  const [ate, setAte] = useState(value.ate);
  const invalido = !de || !ate || de > ate;

  const abertoEm = useRef(0);
  const abrirPersonalizado = () => {
    const m = periodoPreset("mes");
    setDe(value.de || m.de);
    setAte(value.ate || m.ate);
    // Aguarda o menu fechar por completo; o clique que fechou o menu não deve fechar o quadro.
    setTimeout(() => { abertoEm.current = Date.now(); setAberto(true); }, 50);
  };
  const aplicar = () => {
    if (invalido) return;
    onChange({ preset: "personalizado", de, ate });
    setAberto(false);
  };

  return (
    <div data-busca="1" className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverAnchor asChild>
          <div className="bg-background flex items-center rounded-md border">
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-r-none" disabled={semSetas}
              aria-label="Período anterior" onClick={() => onChange(navegarPeriodo(value, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" className="h-9 min-w-44 rounded-none border-x font-medium" title="Clique aqui para selecionar outro período">
                  {rotuloPeriodo(value)}<ChevronDown className="ml-1 h-4 w-4 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" onCloseAutoFocus={(e) => e.preventDefault()}>
                {PRESETS_PERIODO.map((o) => (
                  <DropdownMenuItem key={o.value} className={cn(value.preset === o.value && "bg-accent font-medium")}
                    onSelect={() => (o.value === "personalizado" ? abrirPersonalizado() : onChange(periodoPreset(o.value)))}>
                    {o.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 rounded-l-none" disabled={semSetas}
              aria-label="Próximo período" onClick={() => onChange(navegarPeriodo(value, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </PopoverAnchor>
        <PopoverContent align="start" className="w-auto p-0" aria-label="Período personalizado"
          onOpenAutoFocus={(e) => { e.preventDefault(); setTimeout(() => document.getElementById("periodo-de")?.focus(), 0); }}
          onFocusOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => { if (Date.now() - abertoEm.current < 400) e.preventDefault(); }}>
          <form onSubmit={(e) => { e.preventDefault(); aplicar(); }}>
            <div className="flex items-end gap-2 p-4">
              <div className="space-y-1">
                <Label htmlFor="periodo-de" className="text-xs">Data inicial</Label>
                <Input id="periodo-de" type="date" className="w-40" value={de} onChange={(e) => setDe(e.target.value)} />
              </div>
              <span className="pb-2 text-sm text-muted-foreground">até</span>
              <div className="space-y-1">
                <Label htmlFor="periodo-ate" className="text-xs">Data final</Label>
                <Input id="periodo-ate" type="date" className="w-40" min={de || undefined} value={ate} onChange={(e) => setAte(e.target.value)} />
              </div>
            </div>
            {de && ate && de > ate && <p role="alert" className="px-4 pb-2 text-xs text-destructive">A data final deve ser igual ou posterior à inicial.</p>}
            <div className="flex justify-between gap-2 border-t border-border p-3">
              <Button type="button" variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
              <Button type="submit" disabled={invalido}>Aplicar filtro</Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
