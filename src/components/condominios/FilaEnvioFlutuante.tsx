import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, Send, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { percentualEnvio } from "@/lib/cond-avisos-ciclo";
import { dispensarTarefa, useFilaAvisos } from "./avisos-fila";

/** Cartão discreto no canto inferior esquerdo mostrando o progresso dos envios em segundo plano. */
export function FilaEnvioFlutuante() {
  const tarefas = useFilaAvisos();
  const [aberto, setAberto] = useState(true);
  if (!tarefas.length) return null;
  const ativas = tarefas.filter((t) => t.estado === "fila" || t.estado === "enviando").length;
  return (
    <div className="fixed bottom-4 left-4 z-[80] w-80 max-w-[calc(100vw-2rem)] rounded-lg border bg-card shadow-lg" role="status" aria-live="polite">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        {ativas ? <Loader2 className="size-4 animate-spin text-primary" /> : <Send className="size-4 text-primary" />}
        <span className="mr-auto text-sm font-semibold">{ativas ? `Enviando ${ativas} aviso(s)…` : "Envios concluídos"}</span>
        <Button variant="ghost" size="icon" className="size-7" aria-label={aberto ? "Recolher envios" : "Expandir envios"} onClick={() => setAberto(!aberto)}>{aberto ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}</Button>
      </div>
      {aberto && (
        <ul className="max-h-64 space-y-3 overflow-auto p-3">
          {tarefas.map((t) => (
            <li key={t.avisoId} className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                {t.estado === "concluido" ? <CheckCircle2 className="size-4 text-success" /> : t.estado === "erro" ? <XCircle className="size-4 text-destructive" /> : null}
                <span className="mr-auto truncate font-medium">{t.titulo}</span>
                {(t.estado === "concluido" || t.estado === "erro") && <Button variant="ghost" size="icon" className="size-6" aria-label="Dispensar" onClick={() => dispensarTarefa(t.avisoId)}><X className="size-3.5" /></Button>}
              </div>
              <Progress value={percentualEnvio(t.feito, t.total)} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {t.estado === "fila" ? "Na fila…" : t.estado === "erro" ? t.erro : `${t.feito} de ${t.total} (${percentualEnvio(t.feito, t.total)}%)`}
                {t.falhas > 0 && <span className="ml-1 text-destructive">· {t.falhas} falha(s)</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
      {ativas > 0 && aberto && <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">Pode continuar usando o sistema. Não feche nem recarregue esta aba até terminar.</p>}
    </div>
  );
}
