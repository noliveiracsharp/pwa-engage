import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  onChange?: (value: number) => void;
  size?: "sm" | "md";
};

export function StarRating({ value, onChange, size = "md" }: Props) {
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
          onClick={() => onChange?.(value === n ? 0 : n)}
          className={cn("text-muted-foreground transition-colors", onChange && "hover:text-primary")}
        >
          <Star className={cn(iconSize, n <= value && "fill-primary text-primary")} />
        </button>
      ))}
    </div>
  );
}
