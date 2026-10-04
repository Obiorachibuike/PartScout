import Link from "next/link";
import type { Metadata } from "next";
import { History as HistoryIcon } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { getSession } from "@/lib/auth/session";
import { listIdentificationsForUser, listResearchForUser } from "@/lib/db/research-repository";
import { isDatabaseConfigured } from "@/lib/db/client";
import { Badge, Card, CardContent, EmptyState } from "@/components/ui/primitives";
import { verdictMeta } from "@/lib/research/verdict-ui";
import { formatRelative } from "@/lib/utils";
import { Button as UiButton } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Research history",
  description: "Every compatibility research run you have made with PartScout, with its verdict and confidence.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const session = await getSession();

  if (!session) {
    return (
      <PageShell title="Research history" description="Sign in to keep a searchable record of everything you research.">
        <EmptyState
          title="You are not signed in"
          description="PartScout works without an account. Signing in stores your research history and saved lookups on your account so you can find a past answer in seconds."
          action={
            <div className="flex gap-2">
              <UiButton asChild>
                <Link href="/login?next=/history">Sign in</Link>
              </UiButton>
              <UiButton asChild variant="secondary">
                <Link href="/register?next=/history">Create account</Link>
              </UiButton>
            </div>
          }
        />
      </PageShell>
    );
  }

  if (!isDatabaseConfigured()) {
    return (
      <PageShell title="Research history" description="History needs a database on this deployment.">
        <EmptyState
          title="No database configured"
          description="Set DATABASE_URL (see the README) and run the Prisma migrations to store research sessions, saved searches and feedback."
        />
      </PageShell>
    );
  }

  const search = typeof q === "string" ? q.slice(0, 120) : undefined;
  const [history, identifications] = await Promise.all([
    listResearchForUser(session.id, { search, take: 50 }),
    listIdentificationsForUser(session.id, 6),
  ]);

  return (
    <PageShell
      wide
      eyebrow={session.email}
      title="Research history"
      description={`${history.length} research run${history.length === 1 ? "" : "s"}${search ? ` matching “${search}”` : ""}. Open any report to see its evidence trail again.`}
    >
      <form className="mb-6 flex gap-2" action="/history">
        <input
          name="q"
          defaultValue={search ?? ""}
          placeholder="Filter by device, part or question…"
          className="ps-focus-ring h-11 w-full max-w-md rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] px-3.5 text-sm"
        />
        <UiButton type="submit" variant="secondary">
          Filter
        </UiButton>
      </form>

      {history.length === 0 ? (
        <EmptyState
          title="No research yet"
          description="Run a compatibility question and it will appear here with its verdict, confidence and sources."
          action={
            <UiButton asChild>
              <Link href="/search">Start researching</Link>
            </UiButton>
          }
        />
      ) : (
        <ul className="space-y-3">
          {history.map((item) => {
            const verdict = verdictMeta(item.verdict);
            return (
              <li key={item.id}>
                <Card className="transition-colors hover:border-[var(--ps-border-strong)]">
                  <CardContent className="p-4">
                    <Link href={`/results/${item.id}`} className="ps-focus-ring block rounded-lg">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={verdict.tone === "muted" ? "muted" : verdict.tone}>
                          {verdict.emoji} {verdict.short}
                        </Badge>
                        <span className="text-xs text-[var(--ps-muted)]">
                          {item.confidenceScore}% · {item.confidenceLevel.replace(/_/g, " ").toLowerCase()}
                        </span>
                        {item.fixtureData ? <Badge tone="warning">fixture</Badge> : null}
                        <span className="ml-auto text-xs text-[var(--ps-muted)]">{formatRelative(item.createdAt)}</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm font-medium">{item.question}</p>
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--ps-muted)]">
                        <span>intent: {item.intent.replace(/_/g, " ")}</span>
                        {item.device ? <span>device: {item.device}</span> : null}
                        <span>part: {(item.partCategory ?? "other").replace(/_/g, " ")}</span>
                      </p>
                    </Link>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {identifications.length > 0 ? (
        <section className="mt-10">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <HistoryIcon className="size-4 text-[var(--ps-primary)]" aria-hidden />
            Recent part identifications
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {identifications.map((identification) => (
              <li
                key={identification.id}
                className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-3 text-sm"
              >
                <p className="font-mono text-xs text-[var(--ps-muted)]">{identification.identifier || "(no identifier)"}</p>
                <p className="mt-1">{identification.device ?? identification.manufacturer ?? "device unknown"}</p>
                <p className="mt-1 text-[11px] text-[var(--ps-muted)]">
                  {identification.partCategory.replace(/_/g, " ")} ·{" "}
                  {Math.round(Number(identification.confidence) * 100)}% read confidence ·{" "}
                  {formatRelative(identification.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 flex gap-2">
        <UiButton asChild>
          <Link href="/search">New research</Link>
        </UiButton>
        <UiButton asChild variant="secondary">
          <Link href="/saved">Saved research</Link>
        </UiButton>
      </div>

      <UiButton variant="ghost" className="mt-8" asChild>
        <Link href="/profile">Account settings</Link>
      </UiButton>
    </PageShell>
  );
}
