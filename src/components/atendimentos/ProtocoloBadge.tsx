import { Check, Copy, Hash } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Protocolo do atendimento em destaque, com cópia em 1 clique. */
export function ProtocoloBadge({ protocolo, compacto = false, className }: { protocolo?: unknown; compacto?: boolean; className?: string }) {
  const [ok, setOk] = useState(false);
  const p = typeof protocolo === "string" ? protocolo.trim() : "";
  if (!p) return null;
  if (compacto) {
    return <span className={cn("shrink-0 font-mono text-[10px] font-semibold text-primary", className)}>{p}</span>;
  }
  const copiar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(p);
    setOk(true);
    toast.success(`Protocolo ${p} copiado`);
    setTimeout(() => setOk(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={copiar}
      title="Copiar protocolo"
      className={cn("inline-flex h-6 items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 font-mono text-xs font-bold text-primary transition-colors hover:bg-primary/20", className)}
    >
      <Hash className="h-3 w-3" />
      {p.replace(/^#/, "")}
      {ok ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3 opacity-70" />}
    </button>
  );
}
