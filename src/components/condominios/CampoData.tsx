import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dataBrParaIso, isoParaBr, mascaraData } from "@/lib/cond-pessoa";

/** Data dd/mm/aaaa com ícone que abre o calendário. Valor em ISO (aaaa-mm-dd). */
export function CampoData({ id, value, onChange, disabled, inicio = 1920, nascimento = false }: { id?: string; value: string; onChange: (iso: string) => void; disabled?: boolean; inicio?: number; nascimento?: boolean }) {
  const [txt, setTxt] = useState(isoParaBr(value));
  const [aberto, setAberto] = useState(false);
  const data = value ? new Date(`${value}T12:00:00`) : undefined;
  return (
    <div className="flex gap-1">
      <Input id={id} inputMode="numeric" placeholder="dd/mm/aaaa" disabled={disabled} value={txt}
        onChange={(e) => { const t = mascaraData(e.target.value); setTxt(t); const iso = dataBrParaIso(t); if (iso || !t) onChange(iso); }} />
      <Popover open={aberto} onOpenChange={setAberto}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="icon" disabled={disabled} aria-label="Abrir calendário"><CalendarIcon className="size-4" /></Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar mode="single" locale={ptBR} captionLayout="dropdown" startMonth={new Date(Math.min(inicio, new Date().getFullYear()), 0)} endMonth={nascimento ? new Date() : new Date(new Date().getFullYear() + 30, 11)}
            selected={data} defaultMonth={data ?? (nascimento ? new Date(1990, 0) : new Date())} className="pointer-events-auto p-3"
            onSelect={(d) => {
              if (!d) return;
              const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              onChange(iso); setTxt(isoParaBr(iso)); setAberto(false);
            }} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
