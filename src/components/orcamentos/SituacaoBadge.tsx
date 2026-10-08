import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { situacaoMeta } from "@/lib/orcamentos";
import { badgeCorEtapa } from "@/lib/kanban-cores";

/** Usa a cor da etapa vinculada; sem etapa, mantém as cores padrão. */
export function SituacaoBadge({ value, cor, className }: { value: unknown; cor?: string | undefined; className?: string }) {
  const meta = situacaoMeta(value);
  return (
    <Badge variant="outline" className={cn("border-transparent", cor === undefined ? meta.badge : badgeCorEtapa(cor), className)}>
      {meta.label}
    </Badge>
  );
}
