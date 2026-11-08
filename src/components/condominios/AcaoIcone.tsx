import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Botão de ação de linha: somente ícone, com tooltip explicativo (padrão da vertical condomínios). */
export function AcaoIcone({ titulo, onClick, disabled, destrutivo, destaque, children, className }: {
  titulo: string;
  onClick?: () => void;
  disabled?: boolean;
  destrutivo?: boolean;
  destaque?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={titulo}
            disabled={disabled}
            onClick={onClick}
            className={cn(
              "size-8",
              destrutivo && "text-destructive hover:bg-destructive/10 hover:text-destructive",
              destaque && "bg-primary/10 text-primary hover:bg-primary/20",
              className,
            )}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{titulo}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
