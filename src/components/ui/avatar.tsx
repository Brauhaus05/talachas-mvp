import { cn } from "@/lib/utils";

export interface AvatarProps {
  initials: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeMap = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-24 w-24 text-2xl",
} as const;

export function Avatar({ initials, size = "md", className }: AvatarProps) {
  return (
    <span
      className={cn(
        "bg-surface-muted text-text-primary inline-flex items-center justify-center rounded-full font-medium",
        sizeMap[size],
        className
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}
