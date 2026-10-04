import Link from "next/link";
import type { Metadata } from "next";
import { Activity, BarChart3, Database, KeyRound, TriangleAlert } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { getSession, isAdmin } from "@/lib/auth/session";
import { getAdminMetrics } from "@/lib/db/research-repository";
import { isDatabaseConfigured } from "@/lib/db/client";
import { researchCacheStats } from "@/lib/research/cache";
import { describeSearchSetup } from "@/lib/providers/search";
import { describeAIProvider } from "@/lib/providers/ai";
import { getCapabilities, limits } from "@/lib/config";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Admin dashboard",
  description: "Operational metrics for this PartScout deployment.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Admin dashboard.
 *
 * Metrics only — by design there is no interface for entering compatibility
 * mappings anywhere in PartScout. Its knowledge is researched live from the web;
 * an admin screen that let someone type "SM-A155F = compatible" would recreate the
 * hand-maintained database the product exists to avoid.
 */
export default async function AdminPage() {
  const session = await getSession();
  const admin = isAdmin(session);

  const capabilities = getCapabilities({ databaseConfigured: isDatabaseConfigured() });
  const searchSetup = describeSearchSetup();
  const ai = describeAIProvider();
  const cache = await researchCacheStats();
  const metrics = admin ? await getAdminMetrics() : null;

  if (!admin) {
    return (
      <PageShell title="Admin dashboard" description="Restricted to deployment administrators.">
        <EmptyState
          title={session ? "Your account is not an admin" : "Sign in as an admin"}
          description="Add your email to ADMIN_EMAILS (comma separated) and sign in again. PartScout deliberately has no way to grant admin from the UI."
          action={
            <Button asChild>
              <Link href={session ? "/profile" : "/login?next=/admin"}>{session ? "Back to profile" : "Sign in"}</Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      wide
      eyebrow={session?.email}
      title="Admin dashboard"
      description="Operational health of this deployment: providers, cache, usage and failure rates. Compatibility data is never entered here."
    >
      {!capabilities.searchConfigured ? (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-[color-mix(in_oklab,var(--ps-warning)_45%,transparent)] bg-[color-mix(in_oklab,var(--ps-warning)_10%,transparent)] p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-4 text-[var(--ps-warning)]" aria-hidden />
          <div>
            <p className="font-medium">Research is not live yet</p>
            <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-[var(--ps-muted)]">
              {capabilities.setupIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={Activity}
          label="Research (30 days)"
          value={metrics ? String(metrics.totals.researchSessions) : "—"}
          hint={metrics ? `${metrics.totals.searches} searches logged` : "database not available"}
        />
        <MetricCard
          icon={BarChart3}
          label="Cache hit rate"
          value={metrics ? `${Math.round(metrics.cacheHitRate * 100)}%` : "—"}
          hint={`${cache.entries} cached reports`}
        />
        <MetricCard
          icon={Database}
          label="Avg research time"
          value={metrics ? `${(metrics.averageResearchTimeMs / 1000).toFixed(1)}s` : "—"}
          hint={metrics ? `${metrics.totals.feedback} feedback responses` : "no database"}
        />
        <MetricCard
          icon={KeyRound}
          label="Estimated 30d spend"
          value={metrics ? `$${metrics.usage.estimatedCostUsd.toFixed(2)}` : "—"}
          hint={metrics ? `${metrics.usage.promptTokens + metrics.usage.completionTokens} AI tokens` : "no database"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Search provider</CardTitle>
            <CardDescription>
              PartScout talks to licensed search APIs only. It never scrapes Google, Bing or Yahoo result pages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              Active:{" "}
              <span className="font-mono">{searchSetup.providerId ?? "none"}</span>{" "}
              <Badge tone={searchSetup.configured ? "success" : "danger"}>
                {searchSetup.configured ? "configured" : "missing key"}
              </Badge>
            </p>
            <ul className="space-y-1.5 text-xs">
              {searchSetup.available.map((provider) => (
                <li key={provider.id} className="flex flex-wrap items-center gap-2">
                  <Badge tone={provider.ready ? "success" : "muted"} className="text-[10px]">
                    {provider.ready ? "ready" : "inactive"}
                  </Badge>
                  <span className="font-medium">{provider.label}</span>
                  <code className="text-[var(--ps-muted)]">{provider.apiKeyEnvVar}</code>
                  <a
                    className="ml-auto underline"
                    href={provider.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    docs
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI reasoning layer</CardTitle>
            <CardDescription>
              Models phrase answers and read photos. They never decide compatibility and never act as a source.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Provider: <span className="font-mono">{ai.id}</span>{" "}
              <Badge tone={ai.configured ? "success" : "muted"}>{ai.configured ? "ready" : "not configured"}</Badge>
            </p>
            <ul className="space-y-1 text-xs text-[var(--ps-muted)]">
              <li>fast tier: {ai.fastModel ?? "—"}</li>
              <li>smart tier: {ai.smartModel ?? "—"}</li>
              <li>vision: {ai.supportsVision ? "available" : "unavailable"}</li>
            </ul>
            <div className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-3 text-xs text-[var(--ps-muted)]">
              Configured limits: {limits.maxQueriesPerResearch} queries · {limits.maxPagesToFetch} pages ·{" "}
              {limits.maxResearchesPerHourPerIp} research runs/hour/IP ·{" "}
              {limits.maxIdentificationsPerHourPerIp} photo identifications/hour/IP.
            </div>
          </CardContent>
        </Card>
      </div>

      {metrics ? (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <BreakdownCard
              title="Verdict distribution"
              entries={metrics.verdictDistribution.map((entry) => ({ label: entry.verdict, count: entry.count }))}
              emptyHint="No research runs yet."
            />
            <BreakdownCard
              title="Most researched queries"
              entries={metrics.popularQueries.map((entry) => ({ label: entry.query, count: entry.count }))}
              emptyHint="No searches yet."
            />
            <BreakdownCard
              title="Feedback reasons"
              entries={metrics.feedbackSummary.topReasons.map((entry) => ({ label: entry.reason, count: entry.count }))}
              emptyHint="No negative feedback yet."
            />
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Usage &amp; reliability</CardTitle>
              <CardDescription>Cost and failure telemetry from the research pipeline.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Search API calls" value={String(metrics.usage.searchCalls)} />
              <Stat label="Pages fetched" value={String(metrics.usage.pagesFetched)} />
              <Stat label="AI calls" value={String(metrics.usage.aiCalls)} />
              <Stat label="Avg research time" value={`${(metrics.averageResearchTimeMs / 1000).toFixed(1)}s`} />
              <Stat label="Provider failures" value={String(metrics.sourceFailures.length)} />
              <Stat label="AI failures" value={String(metrics.aiErrors.length)} />
              <Stat label="Identifications" value={String(metrics.totals.identifications)} />
              <Stat label="Feedback (helpful / not)" value={`${metrics.feedbackSummary.helpful} / ${metrics.feedbackSummary.notHelpful}`} />
              <Stat label="Saved searches" value={String(metrics.totals.savedSearches)} />
              <Stat label="Cached reports" value={String(metrics.totals.cachedResearch)} />
              <Stat label="Users" value={String(metrics.totals.users)} />
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Metrics unavailable</CardTitle>
            <CardDescription>
              This deployment has no database configured, so PartScout is running in degraded mode: research works and
              is returned to the user, but nothing is persisted. Set <code>DATABASE_URL</code> and run{" "}
              <code>npm run db:deploy</code> to enable metrics.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </PageShell>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--ps-muted)]">
        <Icon className="size-3.5" aria-hidden />
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] text-[var(--ps-muted)]">{hint}</p>
    </Card>
  );
}

function BreakdownCard({
  title,
  entries,
  emptyHint,
}: {
  title: string;
  entries: Array<{ label: string; count: number }>;
  emptyHint: string;
}) {
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-xs text-[var(--ps-muted)]">{emptyHint}</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li key={entry.label}>
                <div className="flex items-baseline justify-between text-xs">
                  <span>{entry.label.replace(/_/g, " ")}</span>
                  <span className="font-mono text-[var(--ps-muted)]">
                    {entry.count}
                    {total > 0 ? ` · ${Math.round((entry.count / total) * 100)}%` : ""}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--ps-surface-3)]">
                  <div
                    className="h-full rounded-full bg-[var(--ps-primary)]"
                    style={{ width: `${total > 0 ? (entry.count / total) * 100 : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-3">
      <p className="text-[11px] uppercase tracking-wide text-[var(--ps-muted)]">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  );
}
