import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Nome padrão por ícone, usado quando um botão só com ícone não informou rótulo. */
const DICAS_ICONE: Record<string, string> = {
  Trash: "Excluir", Trash2: "Excluir", Pencil: "Editar", PencilLine: "Editar", SquarePen: "Editar", Edit: "Editar",
  Eye: "Visualizar", EyeOff: "Ocultar", X: "Fechar", Plus: "Adicionar", Copy: "Duplicar", Download: "Baixar",
  Upload: "Enviar arquivo", Printer: "Imprimir", RefreshCw: "Atualizar", RotateCw: "Atualizar", Search: "Buscar",
  ChevronLeft: "Anterior", ChevronRight: "Próximo", ChevronUp: "Subir", ChevronDown: "Descer", ArrowUp: "Subir",
  ArrowDown: "Descer", Settings: "Configurações", Settings2: "Configurações", Filter: "Filtrar", Send: "Enviar",
  Save: "Salvar", Check: "Confirmar", MoreHorizontal: "Mais ações", MoreVertical: "Mais ações", Ellipsis: "Mais ações",
  EllipsisVertical: "Mais ações", Bell: "Notificações", Share2: "Compartilhar", ExternalLink: "Abrir em nova aba",
  Link: "Copiar link", Mail: "Enviar e-mail", FileText: "Documento", Paperclip: "Anexar", Info: "Informações",
  Menu: "Abrir menu", Sun: "Tema claro", Moon: "Tema escuro", Bold: "Negrito", Italic: "Itálico",
  Underline: "Sublinhado", List: "Lista", ListOrdered: "Lista numerada", Image: "Inserir imagem",
};

function dicaDoIcone(children: React.ReactNode): string | undefined {
  for (const c of React.Children.toArray(children)) {
    if (!React.isValidElement(c) || typeof c.type === "string") continue;
    const t = c.type as { displayName?: string; render?: { displayName?: string } };
    const nome = (t.displayName ?? t.render?.displayName ?? "").replace(/Icon$/, "");
    if (DICAS_ICONE[nome]) return DICAS_ICONE[nome];
  }
  return undefined;
}

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Bloqueia novos cliques até a ação terminar (padrão: true). */
  autoLock?: boolean;
  /** Dica exibida ao passar o mouse/focar. Botões só com ícone usam aria-label/title automaticamente; false desliga. */
  tooltip?: string | false;
}

const LOCK_MS = 500;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, autoLock = true, tooltip, onClick, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const lockRef = React.useRef(false);
    const [locked, setLocked] = React.useState(false);
    const mounted = React.useRef(true);
    React.useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
      };
    }, []);

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        if (!onClick) return;
        if (!autoLock) return onClick(e);
        if (lockRef.current) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        lockRef.current = true;
        setLocked(true);
        const inicio = Date.now();
        const liberar = () => {
          const resto = Math.max(0, LOCK_MS - (Date.now() - inicio));
          setTimeout(() => {
            lockRef.current = false;
            if (mounted.current) setLocked(false);
          }, resto);
        };
        let r: unknown;
        try {
          r = (onClick as (e: React.MouseEvent<HTMLButtonElement>) => unknown)(e);
        } catch (err) {
          liberar();
          throw err;
        }
        if (r && typeof (r as Promise<unknown>).then === "function") {
          (r as Promise<unknown>).finally(liberar);
        } else {
          liberar();
        }
      },
      [onClick, autoLock],
    );

    const ariaLabel = (props as Record<string, unknown>)["aria-label"] as string | undefined;
    const dica =
      tooltip === false ? undefined : (tooltip ?? (size === "icon" ? ariaLabel || props.title : undefined));

    const botao = (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onClick={onClick ? handleClick : undefined}
        disabled={disabled || (autoLock && locked && !asChild) || undefined}
        aria-busy={locked || undefined}
        {...props}
        aria-label={ariaLabel ?? (size === "icon" && typeof dica === "string" ? dica : undefined)}
        title={dica ? undefined : props.title}
      />
    );

    if (!dica) return botao;
    return (
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger asChild>{botao}</TooltipTrigger>
          <TooltipContent side="bottom">{dica}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
