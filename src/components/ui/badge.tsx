import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "outline" | "muted";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const styles = {
    default: "bg-action-primary text-text-inverse",
    outline: "border border-border-strong text-text-primary",
    muted: "bg-surface-muted text-text-secondary",
  }[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center px-3 py-1 text-xs font-medium",
        styles,
        className
      )}
      {...props}
    />
  );
}
