"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "ps-focus-ring inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-[background-color,color,border-color,box-shadow,transform] duration-150 disabled:pointer-events-none disabled:opacity-50 active:translate-y-[0.5px] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--ps-primary)] text-white shadow-[0_10px_30px_-12px_color-mix(in_oklab,var(--ps-primary)_70%,transparent)] hover:bg-[var(--ps-primary-strong)]",
        secondary:
          "bg-[var(--ps-surface-2)] text-[var(--ps-text)] border border-[var(--ps-border)] hover:border-[var(--ps-border-strong)] hover:bg-[var(--ps-surface-3)]",
        ghost: "text-[var(--ps-muted)] hover:text-[var(--ps-text)] hover:bg-[var(--ps-surface-2)]",
        outline:
          "border border-[var(--ps-border-strong)] bg-transparent text-[var(--ps-text)] hover:bg-[var(--ps-surface-2)]",
        danger: "bg-[var(--ps-danger)] text-white hover:opacity-90",
        subtle:
          "bg-[color-mix(in_oklab,var(--ps-primary)_12%,transparent)] text-[var(--ps-primary)] hover:bg-[color-mix(in_oklab,var(--ps-primary)_18%,transparent)]",
      },
      size: {
        sm: "h-9 px-3 text-[13px] [&_svg]:size-4",
        md: "h-11 px-4 [&_svg]:size-4",
        lg: "h-12 px-6 text-base [&_svg]:size-5",
        icon: "size-10 [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
