import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { getResearchById } from "@/lib/db/research-repository";
import { getCachedResearch, getMemoryCachedReportById } from "@/lib/research/cache";
import { ResearchReportView } from "@/components/research/research-report-view";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/primitives";
import { PageShell } from "@/components/layout/page-shell";
import { verdictMeta } from "@/lib/research/verdict-ui";
import type { ResearchReport } from "@/types/research";
import { appConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

async function loadReport(id: string): Promise<ResearchReport | null> {
  // Database-backed ids (persisted research sessions) come first…
  const stored = await getResearchById(id);
  if (stored) return stored.report;

  // …then ids that were never persisted (no DATABASE_URL) — resolved through the
  // in-process research cache so the live-preview flow still works end to end.
  const memoryCached = getMemoryCachedReportById(id);
  if (memoryCached) return memoryCached;

  // `rk_<cacheKey>` links (shareable cache references).
  if (id.startsWith("rk_")) {
    const cached = await getCachedResearch(id.slice(3));
    if (cached) return cached.report;
  }
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const report = await loadReport(id);
  if (!report) {
    return { title: "Research not found", robots: { index: false, follow: false } };
  }
  return {
    title: report.headline.slice(0, 70),
    description: report.answer.slice(0, 180),
    alternates: { canonical: `/results/${id}` },
    // Research reports are time-sensitive and per-question: keep them out of the index.
    robots: { index: false, follow: true },
  };
}

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await loadReport(id);

  if (!report) {
    notFound();
  }

  const verdict = verdictMeta(report.verdict);

  return (
    <PageShell
      wide
      eyebrow="Research report"
      title={report.question}
      description={`Researched ${new Date(report.createdAt).toLocaleString()} · ${report.sources.length} sources · ${report.claims.length} evidence claims`}
    >
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/search">
            <ArrowLeft aria-hidden />
            New research
          </Link>
        </Button>
        <Badge tone={verdict.tone === "muted" ? "muted" : verdict.tone}>
          {verdict.emoji} {verdict.short}
        </Badge>
        {report.fixtureData ? (
          <Badge tone="warning">
            <FlaskConical className="size-3" aria-hidden />
            Fixture data (development only)
          </Badge>
        ) : null}
        <span className="ml-auto text-xs text-[var(--ps-muted)]">
          {appConfig.appName} · report id <code>{report.id}</code>
        </span>
      </div>

      <ResearchReportView report={report} />
    </PageShell>
  );
}
