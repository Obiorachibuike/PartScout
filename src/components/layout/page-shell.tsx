import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageShell({
  title,
  description,
  eyebrow,
  children,
  className,
  wide = false,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div className={cn("mx-auto w-full px-4 py-10 sm:px-6", wide ? "max-w-7xl" : "max-w-5xl", className)}>
      <header className="mb-8 max-w-3xl">
        {eyebrow ? (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ps-primary)]">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 text-sm leading-relaxed text-[var(--ps-muted)]">{description}</p> : null}
      </header>
      {children}
    </div>
  );
}
