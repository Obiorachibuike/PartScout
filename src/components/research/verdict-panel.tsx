"use client";

import { motion } from "framer-motion";
import { Info } from "lucide-react";
import type { ResearchReport } from "@/types/research";
import { Badge, Card, Separator } from "@/components/ui/primitives";
import { levelMeta, verdictMeta } from "@/lib/research/verdict-ui";
import { formatRelative } from "@/lib/utils";
import { ReportActions } from "@/components/research/report-actions";

export function VerdictPanel({ report }: { report: ResearchReport }) {
  const verdict = verdictMeta(report.verdict);
  const level = levelMeta(report.confidence.level);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <Card className="overflow-hidden">
        <div
          className="h-1.5 w-full"
          style={{ background: `linear-gradient(90deg, ${verdict.color}, ${level.color})` }}
          aria-hidden
        />
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  tone={verdict.tone === "muted" ? "muted" : verdict.tone}
                  className="px-3 py-1 text-[13px]"
                >
                  <span aria-hidden>{verdict.emoji}</span>
                  {verdict.short}
                </Badge>
                {report.fixtureData ? (
                  <Badge tone="warning" title="Synthetic fixtures are for development only">
                    Fixture data — not real research
                  </Badge>
                ) : null}
                {report.cached ? (
                  <Badge tone="info">Cached research · {formatRelative(report.createdAt)}</Badge>
                ) : null}
                {report.usage.cached ? <Badge tone="muted">Served from cache</Badge> : null}
              </div>
              <h1 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">{report.headline}</h1>
              <p className="max-w-3xl text-sm leading-relaxed text-[var(--ps-muted)]">{verdict.description}</p>
            </div>

            <div className="w-full max-w-[13rem] shrink-0">
              <div className="rounded-2xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--ps-muted)]">Evidence confidence</p>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tabular-nums" style={{ color: level.color }}>
                    {report.confidence.score}%
                  </span>
                  <span className="text-sm" style={{ color: level.color }}>
                    {level.emoji} {report.confidence.label}
                  </span>
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--ps-surface-3)]">
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{ width: `${report.confidence.score}%`, background: level.color }}
                  />
                </div>
                <p className="mt-2 text-[11px] leading-snug text-[var(--ps-muted)]">{report.confidence.summary}</p>
              </div>
            </div>
          </div>

          <Separator className="my-5" />

          <div className="prose-invert max-w-3xl space-y-3">
            <p className="text-[15px] leading-relaxed">{report.answer}</p>
            {report.summaryBullets.length > 0 ? (
              <ul className="list-inside list-disc space-y-1 text-sm text-[var(--ps-muted)]">
                {report.summaryBullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </div>

          {report.failure ? (
            <div className="mt-5 rounded-xl border border-[color-mix(in_oklab,var(--ps-danger)_40%,transparent)] bg-[color-mix(in_oklab,var(--ps-danger)_10%,transparent)] p-4">
              <p className="text-sm font-medium">{report.failure.message}</p>
              {report.failure.remediation.length > 0 ? (
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-[var(--ps-muted)]">
                  {report.failure.remediation.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-2 text-[11px] text-[var(--ps-muted)]">
                Failure code: <code>{report.failure.code}</code>
              </p>
            </div>
          ) : null}

          <div className="mt-5 flex items-start gap-2 rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-3.5 text-xs text-[var(--ps-muted)]">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <p>{report.confidence.disclaimer}</p>
          </div>

          <div className="mt-5">
            <ReportActions report={report} />
          </div>

          <p className="mt-4 text-[11px] text-[var(--ps-muted)]">
            {report.sources.length} source{report.sources.length === 1 ? "" : "s"} · {report.claims.length} evidence
            claim{report.claims.length === 1 ? "" : "s"} · {report.usage.searchCalls} searches ·{" "}
            {report.usage.pagesFetched} pages read
            {report.usage.aiCalls > 0 ? ` · ${report.usage.aiCalls} model calls` : " · deterministic engine only"}
            {report.usage.estimatedCostUsd > 0
              ? ` · ≈$${report.usage.estimatedCostUsd.toFixed(4)} this run`
              : ""}
          </p>
        </div>
      </Card>
    </motion.div>
  );
}
