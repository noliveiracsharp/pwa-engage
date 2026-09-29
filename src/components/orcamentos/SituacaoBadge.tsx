import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { situacaoMeta } from "@/lib/orcamentos";

/** Em andamento = amarelo, Aprovado = verde, Reprovado = vermelho. */
export function SituacaoBadge({ value, className }: { value: unknown; className?: string }) {
  const meta = situacaoMeta(value);
  return (
    <Badge variant="outline" className={cn("border-transparent", meta.badge, className)}>
      {meta.label}
    </Badge>
  );
}
