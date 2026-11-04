import { Loader2 } from "lucide-react";

/** Indicador animado enquanto os dados financeiros chegam do banco. */
export function Carregando({ texto = "Carregando dados financeiros…" }: { texto?: string }) {
  return (
    <div role="status" className="text-muted-foreground flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-sm">
      <Loader2 className="text-primary h-8 w-8 animate-spin" />
      <span className="animate-pulse">{texto}</span>
    </div>
  );
}
