import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        // Campos sem <Label htmlFor> ganham nome acessível a partir do placeholder.
        aria-label={
          props["aria-label"] ??
          (!props.id && !props["aria-labelledby"] && props.placeholder ? props.placeholder : undefined)
        }
        {...props}
        onClick={(e) => {
          props.onClick?.(e);
          // Campos de data abrem o calendário ao clicar em qualquer ponto do campo.
          const el = e.currentTarget;
          if (!e.defaultPrevented && !el.disabled && !el.readOnly && /^(date|datetime-local|month|time)$/.test(el.type)) {
            try { el.showPicker?.(); } catch { /* navegador sem suporte */ }
          }
        }}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
