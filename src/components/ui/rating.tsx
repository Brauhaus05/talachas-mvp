import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RatingProps {
  value: number;
  reviewsCount?: number;
  size?: "sm" | "md";
  showValue?: boolean;
  className?: string;
}

export function Rating({
  value,
  reviewsCount,
  size = "sm",
  showValue = true,
  className,
}: RatingProps) {
  const dim = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <span
      className={cn(
        "text-text-primary inline-flex items-center gap-1.5 text-sm",
        className
      )}
    >
      <Star className={cn(dim, "fill-current")} aria-hidden />
      {showValue && <span className="font-semibold">{value.toFixed(1)}</span>}
      {typeof reviewsCount === "number" && (
        <span className="text-text-muted">({reviewsCount})</span>
      )}
    </span>
  );
}
