import { Badge } from "@/components/ui/badge";

/** Renders a boolean status column as Ativo/Inativo. */
export function StatusBadge({ value }: { value: unknown }) {
  const active = value === true || value === "true";
  return (
    <Badge variant={active ? "default" : "secondary"} className={active ? "" : "text-muted-foreground"}>
      {active ? tr("status.ativo") : tr("status.inativo")}
    </Badge>
  );
}
