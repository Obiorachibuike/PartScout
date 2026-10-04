"use client";

import * as React from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/page-shell";

/**
 * Route-level error boundary. Provider/search failures are usually transient, so
 * the copy explains what to try instead of showing a raw stack trace.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    // Keep the digest in the console for support; details stay server-side.
    console.error("PartScout route error", error.digest ?? error.message);
  }, [error]);

  return (
    <PageShell
      title="Something went wrong on this page"
      description="PartScout could not finish rendering this view. Research runs already completed are safe — nothing is lost."
    >
      <div className="rounded-[var(--radius-card)] border border-[color-mix(in_oklab,var(--ps-danger)_40%,transparent)] bg-[color-mix(in_oklab,var(--ps-danger)_8%,transparent)] p-6">
        <div className="flex items-start gap-3">
          <TriangleAlert className="mt-0.5 size-4 text-[var(--ps-danger)]" aria-hidden />
          <div className="space-y-3">
            <p className="text-sm">
              {error.message || "Unexpected error."}
              {error.digest ? <span className="ml-2 font-mono text-[11px] text-[var(--ps-muted)]">{error.digest}</span> : null}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={reset}>Try again</Button>
              <Button asChild variant="secondary">
                <Link href="/search">Start a new research run</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/help">Troubleshooting help</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
