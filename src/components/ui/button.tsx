import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-[background-color,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none",
  {
    variants: {
      variant: {
        // The hard offset shadow is what delineates a magenta fill from the bone
        // page — magenta on bone is only 2.51:1, below the 3:1 graphical floor,
        // while the ink shadow reads at 12.73:1.
        primary:
          "bg-action-primary text-text-on-accent shadow-hard-sm hover:bg-action-primary-hover active:bg-action-primary-hover",
        secondary:
          "bg-action-secondary text-text-primary hover:bg-action-secondary-hover active:bg-action-secondary-hover",
        outline:
          "border border-border-strong bg-transparent text-text-primary hover:bg-surface-muted active:bg-surface-muted",
        // Deliberately NOT a solid fill and deliberately no shadow: a destructive
        // action is usually a repeated row-level control, and giving it primary's
        // weight is what made the admin tables unreadable. Its own border carries
        // 4.70:1 on bone, so it is delineated without elevation.
        destructive:
          "border border-action-destructive bg-transparent text-action-destructive hover:bg-surface-muted active:bg-surface-muted",
        ghost:
          "bg-transparent text-text-primary hover:bg-surface-muted active:bg-surface-muted",
        link: "bg-transparent text-text-primary underline-offset-4 hover:underline active:underline",
      },
      size: {
        xs: "h-8 px-3 text-xs",
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-14 px-6 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Shows a spinner and disables the button while an action is pending. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />}
      {children}
    </button>
  )
);
Button.displayName = "Button";

export { buttonVariants };
