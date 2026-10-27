import { CornerUpLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Mensagem citada numa resposta (guardada na coluna `citacao`). */
export type Citacao = { id: string; autor: string; texto: string; externo?: string | null };

/** Trecho curto para mostrar a citação. */
export function resumoCitacao(texto: string, max = 120): string {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t || "Mídia";
}

/** Lê a citação gravada (ignora formatos inválidos). */
export function lerCitacao(v: unknown): Citacao | null {
  const o = typeof v === "string" ? (() => { try { return JSON.parse(v) as unknown; } catch { return null; } })() : v;
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  if (typeof r["id"] !== "string" || !r["id"]) return null;
  return { id: r["id"], autor: String(r["autor"] ?? ""), texto: String(r["texto"] ?? ""), externo: typeof r["externo"] === "string" ? r["externo"] : null };
}

/** Rola até a mensagem original e destaca por um instante. */
export function irParaMensagem(id: string) {
  const el = document.getElementById(`msg-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-primary", "rounded-lg");
  setTimeout(() => el.classList.remove("ring-2", "ring-primary", "rounded-lg"), 1600);
}

/** Faixa acima da caixa de texto mostrando a mensagem que está sendo respondida. */
export function FaixaResposta({ citacao, onCancelar }: { citacao: Citacao; onCancelar: () => void }) {
  return (
    <div className="relative mb-2 flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md bg-muted py-2 pl-4 pr-2 text-sm">
      <span className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden />
      <CornerUpLeft className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="truncate text-xs font-semibold text-primary">Respondendo {citacao.autor || "mensagem"}</p>
        <p className="truncate text-muted-foreground">{resumoCitacao(citacao.texto)}</p>
      </div>
      <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onCancelar} tooltip="Cancelar resposta" aria-label="Cancelar resposta">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** Cartão da citação dentro do balão; clicar leva à mensagem original. */
export function CitacaoNoBalao({ citacao, claro }: { citacao: Citacao; claro?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => irParaMensagem(citacao.id)}
      className={cn(
        "relative mb-1 block w-full min-w-0 overflow-hidden rounded-md py-1 pl-3 pr-2 text-left text-xs",
        claro ? "bg-primary-foreground/15" : "bg-background/60",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", claro ? "bg-primary-foreground/70" : "bg-primary")} aria-hidden />
      <span className="block truncate font-semibold">{citacao.autor || "Mensagem"}</span>
      <span className="line-clamp-2 break-words opacity-80">{resumoCitacao(citacao.texto)}</span>
    </button>
  );
}
