"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Small presentational primitives shared across the app (cards, badges, inputs).
 * Kept in one module to avoid a dozen near-identical files.
 */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-[var(--ps-border)] bg-[var(--ps-surface)] shadow-[var(--shadow-card)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5 p-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-[var(--ps-muted)]", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center gap-3 p-5 pt-0", className)} {...props} />;
}

type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "muted";

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  const tones: Record<BadgeTone, string> = {
    neutral: "border-[var(--ps-border)] bg-[var(--ps-surface-2)] text-[var(--ps-text)]",
    primary:
      "border-[color-mix(in_oklab,var(--ps-primary)_45%,transparent)] bg-[color-mix(in_oklab,var(--ps-primary)_15%,transparent)] text-[var(--ps-primary)]",
    success:
      "border-[color-mix(in_oklab,var(--ps-success)_45%,transparent)] bg-[color-mix(in_oklab,var(--ps-success)_15%,transparent)] text-[var(--ps-success)]",
    warning:
      "border-[color-mix(in_oklab,var(--ps-warning)_45%,transparent)] bg-[color-mix(in_oklab,var(--ps-warning)_16%,transparent)] text-[var(--ps-warning)]",
    danger:
      "border-[color-mix(in_oklab,var(--ps-danger)_45%,transparent)] bg-[color-mix(in_oklab,var(--ps-danger)_15%,transparent)] text-[var(--ps-danger)]",
    info: "border-[color-mix(in_oklab,var(--ps-info)_45%,transparent)] bg-[color-mix(in_oklab,var(--ps-info)_15%,transparent)] text-[var(--ps-info)]",
    muted: "border-transparent bg-[var(--ps-surface-3)] text-[var(--ps-muted)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "ps-focus-ring h-11 w-full rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] px-3.5 text-sm text-[var(--ps-text)] placeholder:text-[var(--ps-muted)]/70 transition-colors hover:border-[var(--ps-border-strong)]",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "ps-focus-ring w-full resize-none rounded-2xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] px-4 py-3.5 text-[15px] leading-relaxed text-[var(--ps-text)] placeholder:text-[var(--ps-muted)]/70 transition-colors hover:border-[var(--ps-border-strong)]",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-xs font-medium uppercase tracking-wide text-[var(--ps-muted)]", className)}
      {...props}
    />
  );
}

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn("h-px w-full bg-[var(--ps-border)]", className)} />;
}

export function Progress({ value, className, tone }: { value: number; className?: string; tone?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-[var(--ps-surface-3)]", className)}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${clamped}%`, background: tone ?? "var(--ps-primary)" }}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("ps-shimmer rounded-lg bg-[var(--ps-surface-2)]", className)} />;
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--ps-border-strong)] bg-[var(--ps-surface)]/60 p-8 text-center",
        className,
      )}
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-md text-sm text-[var(--ps-muted)]">{description}</p>
      {action}
    </div>
  );
}

export function Collapsible({
  summary,
  children,
  defaultOpen = false,
  className,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details open={defaultOpen} className={cn("group rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)]", className)}>
      <summary className="ps-focus-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl p-3.5 text-sm font-medium marker:hidden">
        {summary}
        <span className="text-[var(--ps-muted)] transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-[var(--ps-border)] p-3.5 text-sm text-[var(--ps-muted)]">{children}</div>
    </details>
  );
}
