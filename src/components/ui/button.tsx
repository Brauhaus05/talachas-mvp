import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // The press model is the DS's: elevation collapses and the element translates
  // into where its shadow was (DS utilities.css, `.jalo-pressable`). It replaces
  // the old `active:scale-[0.98]`. 60ms linear matches the DS exactly, and the
  // transition is disabled — not the transform — under reduced motion.
  "inline-flex items-center justify-center gap-2 font-medium transition-[background-color,box-shadow,transform] duration-[60ms] ease-linear motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none",
  {
    variants: {
      variant: {
        // The hard offset shadow is what delineates a magenta fill from the bone
        // page — magenta on bone is only 2.51:1, below the 3:1 graphical floor,
        // while the ink shadow reads at 12.73:1.
        // No hover tint: DS `Button.css` gives primary no :hover at all. Pressing
        // collapses the shadow to `0 0 0` — NOT `shadow-none` — because a
        // box-shadow only animates between two interpolable values, and `none`
        // is not one. Translating by the 3px shadow offset moves the button into
        // the space the shadow occupied.
        primary:
          "bg-action-primary text-text-on-accent shadow-hard-sm active:shadow-[0_0_0_var(--color-text-primary)] active:translate-x-[3px] active:translate-y-[3px]",
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
