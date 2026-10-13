import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

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
}

const LOCK_MS = 500;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, autoLock = true, onClick, disabled, ...props }, ref) => {
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

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        onClick={onClick ? handleClick : undefined}
        disabled={disabled || (autoLock && locked && !asChild) || undefined}
        aria-busy={locked || undefined}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
