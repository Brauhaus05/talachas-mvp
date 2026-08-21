import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function IconTile({
  icon: Icon,
  size = "md",
  className,
}: {
  icon: LucideIcon;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dim = size === "lg" ? "h-14 w-14" : size === "sm" ? "h-9 w-9" : "h-12 w-12";
  const iconDim = size === "lg" ? "h-6 w-6" : size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <span
      className={cn(
        "bg-surface-muted text-text-primary inline-flex items-center justify-center",
        dim,
        className
      )}
      aria-hidden
    >
      <Icon className={iconDim} />
    </span>
  );
}
