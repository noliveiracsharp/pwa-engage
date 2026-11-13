import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { quadroVencimentos } from "@/lib/cond-documentos";
import { cn } from "@/lib/utils";

type Cond = { value: string; label: string };
type Filtro = "todos" | "vencido" | "a_vencer";
const dataBR = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");

/** Quadro de avisos de vencimento de documentos para síndico e administração. */
export function QuadroVencimentos({ condominios, onAbrir }: { condominios: Cond[]; onAbrir: (condId: string) => void }) {
  const ids = useMemo(() => condominios.map((c) => c.value), [condominios]);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["cond", "cond_documentos", "quadro", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("cond_documentos").select("*").in("condominio_id", ids).not("data_vencimento", "is", null);
      if (error) return [];
      return data ?? [];
    },
  });
  const alertas = useMemo(() => quadroVencimentos(docs), [docs]);
  const vencidos = alertas.filter((a) => a.status === "vencido").length;
  const lista = filtro === "todos" ? alertas : alertas.filter((a) => a.status === filtro);
  const nome = (id: string) => condominios.find((c) => c.value === id)?.label ?? "—";
  const varios = condominios.length > 1;

  return (
    <section aria-labelledby="quadro-venc" className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <CalendarClock className="size-5 text-primary" aria-hidden />
        <h2 id="quadro-venc" className="text-lg font-bold">Quadro de avisos · documentos</h2>
        <div role="group" aria-label="Filtrar avisos" className="ml-auto flex gap-1">
          {([["todos", `Todos (${alertas.length})`], ["vencido", `Vencidos (${vencidos})`], ["a_vencer", `A vencer (${alertas.length - vencidos})`]] as const).map(([v, l]) => (
            <Button key={v} size="sm" variant={filtro === v ? "default" : "outline"} aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{l}</Button>
          ))}
        </div>
      </div>
      {vencidos > 0 && (
        <p role="alert" className="mt-3 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
          <AlertTriangle className="size-4" aria-hidden /> {vencidos} documento(s) vencido(s). Providencie a renovação.
        </p>
      )}
      {isLoading ? <p className="mt-3 text-sm text-muted-foreground">Carregando…</p>
        : lista.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-success" aria-hidden /> Nenhum documento vencido ou perto de vencer.</p>
        ) : (
          <ul className="mt-3 max-h-80 divide-y overflow-y-auto">
            {lista.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => onAbrir(a.condominioId)} className="flex w-full items-center gap-3 rounded px-1 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <FileText className={cn("size-4 shrink-0", a.status === "vencido" ? "text-destructive" : "text-warning")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.titulo}</span>
                    <span className="block truncate text-xs text-muted-foreground">{varios ? `${nome(a.condominioId)} · ` : ""}Vence em {dataBR(a.vencimento)}</span>
                  </span>
                  <Badge variant="outline" className={a.status === "vencido" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-warning/40 bg-warning/10 text-warning"}>
                    {a.status === "vencido" ? `Vencido há ${-a.dias} dia(s)` : a.dias === 0 ? "Vence hoje" : `Faltam ${a.dias} dia(s)`}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
