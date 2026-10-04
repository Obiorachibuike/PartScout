import Link from "next/link";
import type { Metadata } from "next";
import { Bookmark } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { getSession } from "@/lib/auth/session";
import { listSavedSearches } from "@/lib/db/research-repository";
import { isDatabaseConfigured } from "@/lib/db/client";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { SavedList } from "@/components/research/saved-list";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Saved research",
  description: "Your saved PartScout queries and reports, ready to re-run.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const session = await getSession();

  if (!session) {
    return (
      <PageShell title="Saved research" description="Sign in to keep a shortlist of lookups your workshop reuses.">
        <EmptyState
          title="You are not signed in"
          description="Save frequently researched parts and devices so the whole workshop can jump straight back to the evidence."
          action={
            <Button asChild>
              <Link href="/login?next=/saved">Sign in</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  if (!isDatabaseConfigured()) {
    return (
      <PageShell title="Saved research" description="Saved research needs a database on this deployment.">
        <EmptyState
          title="No database configured"
          description="Set DATABASE_URL and run the Prisma migrations to store saved searches."
        />
      </PageShell>
    );
  }

  const saved = await listSavedSearches(session.id);

  return (
    <PageShell
      wide
      eyebrow={session.email}
      title="Saved research"
      description={`${saved.length} saved lookup${saved.length === 1 ? "" : "s"}. Research is always re-run live, so a saved query is a shortcut — not a stale answer.`}
    >
      {saved.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          description="Open any report and press Save to keep it here."
          action={
            <Button asChild>
              <Link href="/search">Start researching</Link>
            </Button>
          }
        />
      ) : (
        <SavedList
          items={saved.map((item) => ({
            id: item.id,
            label: item.label,
            query: item.query,
            mode: item.mode,
            createdAt: new Date(item.createdAt).toISOString(),
          }))}
        />
      )}

      <p className="mt-8 flex items-center gap-2 text-xs text-[var(--ps-muted)]">
        <Bookmark className="size-3.5" aria-hidden />
        Saved queries never cache an old verdict: re-running re-searches the live web and re-scores the evidence.
      </p>
      {saved[0] ? (
        <p className="mt-1 text-[11px] text-[var(--ps-muted)]">
          Most recent save: {formatRelative(saved[0].createdAt)}{" "}
          <Badge tone="muted" className="ml-1 text-[10px]">
            {saved[0].mode}
          </Badge>
        </p>
      ) : null}
    </PageShell>
  );
}
