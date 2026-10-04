import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/page-shell";

export default function NotFound() {
  return (
    <PageShell
      title="That page or report is not here"
      description="Research reports are ephemeral by default: they expire from the cache, and cached reports are only reachable while they are still valid."
    >
      <div className="flex flex-col items-start gap-4 rounded-[var(--radius-card)] border border-[var(--ps-border)] bg-[var(--ps-surface)] p-6">
        <span className="grid size-10 place-items-center rounded-xl bg-[var(--ps-surface-2)] text-[var(--ps-primary)]">
          <Compass className="size-5" aria-hidden />
        </span>
        <p className="text-sm text-[var(--ps-muted)]">
          Re-running the question is usually better than an old report anyway — compatibility evidence changes as
          suppliers update their listings.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/search">Start a new research run</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/">Back to the homepage</Link>
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
