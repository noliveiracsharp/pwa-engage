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
    <div className="mb-2 flex items-start gap-2 rounded-md border-l-4 border-primary bg-muted px-3 py-2 text-sm">
      <CornerUpLeft className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-primary">Respondendo {citacao.autor || "mensagem"}</p>
        <p className="truncate text-muted-foreground">{resumoCitacao(citacao.texto)}</p>
      </div>
      <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onCancelar} tooltip="Cancelar resposta" aria-label="Cancelar resposta">
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
        "mb-1 block w-full rounded-md border-l-4 px-2 py-1 text-left text-xs",
        claro ? "border-primary-foreground/70 bg-primary-foreground/15" : "border-primary bg-background/60",
      )}
    >
      <span className="block font-semibold">{citacao.autor || "Mensagem"}</span>
      <span className="line-clamp-2 opacity-80">{resumoCitacao(citacao.texto)}</span>
    </button>
  );
}
