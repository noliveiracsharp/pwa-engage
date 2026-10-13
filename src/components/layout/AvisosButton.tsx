import { useEffect, useState } from "react";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type Aviso, limparAvisos, listarAvisos, marcarLido, marcarTodosLidos, onAvisos, removerAviso } from "@/lib/avisos";

export function AvisosButton() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  useEffect(() => { setAvisos(listarAvisos()); return onAvisos(() => setAvisos(listarAvisos())); }, []);
  const naoLidos = avisos.filter((a) => !a.lido).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Avisos" title="Avisos">
          <Bell className="h-5 w-5" />
          {naoLidos > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {naoLidos > 99 ? "99+" : naoLidos}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="font-semibold text-foreground">Avisos</span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={!naoLidos} onClick={marcarTodosLidos}><CheckCheck className="mr-1 h-4 w-4" />Ler todos</Button>
            <Button size="sm" variant="ghost" disabled={!avisos.length} onClick={() => confirm("Apagar todos os avisos?") && limparAvisos()}><Trash2 className="mr-1 h-4 w-4" />Limpar</Button>
          </div>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto">
          {avisos.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Nenhum aviso.</li>}
          {avisos.map((a) => (
            <li key={a.id} className={`group flex gap-2 border-b border-border px-3 py-2 last:border-0 ${a.lido ? "" : "bg-primary/5"}`}>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { marcarLido(a.id); if (a.link) window.location.href = a.link; }}>
                <p className={`truncate text-sm ${a.lido ? "text-foreground" : "font-semibold text-foreground"}`}>{a.titulo}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{a.texto}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{new Date(a.em).toLocaleString("pt-BR")}</p>
              </button>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => removerAviso(a.id)} aria-label="Apagar aviso">
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
