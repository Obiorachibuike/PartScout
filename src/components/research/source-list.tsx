"use client";

import * as React from "react";
import { ExternalLink, FileText } from "lucide-react";
import type { EvaluatedSource } from "@/types/research";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Separator } from "@/components/ui/primitives";
import { tierLabel } from "@/lib/research/verdict-ui";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Source cards.
 *
 * Every URL here came from the search provider and was fetched (or explicitly
 * marked as metadata-only when the fetch was blocked). Nothing is synthesised —
 * if PartScout did not retrieve a page, it is not shown as evidence.
 */
export function SourceList({ sources, claimsBySource }: { sources: EvaluatedSource[]; claimsBySource: Map<string, number> }) {
  const [filter, setFilter] = React.useState<"all" | "primary" | "secondary">("all");

  const filtered = sources.filter((source) =>
    filter === "all" ? true : filter === "primary" ? source.quality.tier <= 2 : source.quality.tier >= 3,
  );

  if (sources.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sources</CardTitle>
          <CardDescription>No pages could be retrieved for this question.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Sources ({sources.length})</CardTitle>
            <CardDescription>
              Tiered by source category and scored on authority, relevance, directness, model/part specificity,
              recency, independence and whether the page makes an explicit claim.
            </CardDescription>
          </div>
          <div className="flex gap-1.5">
            {(
              [
                { id: "all", label: "All" },
                { id: "primary", label: "Tier 1–2" },
                { id: "secondary", label: "Tier 3–4" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                className={cn(
                  "ps-focus-ring rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  filter === option.id
                    ? "border-transparent bg-[var(--ps-primary)] text-white"
                    : "border-[var(--ps-border)] text-[var(--ps-muted)] hover:text-[var(--ps-text)]",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {filtered.map((source, index) => (
          <div key={source.id}>
            {index > 0 ? <Separator className="mb-3" /> : null}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="ps-focus-ring inline-flex items-start gap-1.5 text-sm font-medium hover:underline"
                >
                  <span className="line-clamp-2">{source.title || source.domain}</span>
                  <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-[var(--ps-muted)]" aria-hidden />
                </a>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--ps-muted)]">
                  <span className="font-mono">{source.domain}</span>
                  <span>· {tierLabel(source.quality.tier)}</span>
                  <span>· quality {Math.round(source.quality.total * 100)}%</span>
                  {source.publishedAt ? <span>· published {formatDate(source.publishedAt)}</span> : null}
                  {claimsBySource.get(source.id) ? (
                    <Badge tone="primary" className="text-[10px]">
                      {claimsBySource.get(source.id)} claim{claimsBySource.get(source.id) === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                  {!source.fetched ? (
                    <Badge tone="warning" className="text-[10px]">
                      metadata only — page not retrieved
                    </Badge>
                  ) : null}
                </p>
                {source.text ? (
                  <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[var(--ps-muted)]">
                    {source.text.slice(0, 320)}
                  </p>
                ) : null}
                {source.quality.notes.length > 0 ? (
                  <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--ps-muted)]/90">
                    {source.quality.notes.slice(0, 4).map((note) => (
                      <li key={note} className="flex items-center gap-1">
                        <FileText className="size-3" aria-hidden />
                        {note}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="grid w-full max-w-[10rem] grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-[var(--ps-muted)] sm:w-auto">
                <ScoreCell label="Authority" value={source.quality.authority} />
                <ScoreCell label="Relevance" value={source.quality.relevance} />
                <ScoreCell label="Directness" value={source.quality.directness} />
                <ScoreCell label="Model" value={source.quality.modelSpecificity} />
                <ScoreCell label="Part" value={source.quality.partSpecificity} />
                <ScoreCell label="Recency" value={source.quality.recency} />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ScoreCell({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="uppercase tracking-wide opacity-80">{label}</p>
      <p className="font-mono text-[var(--ps-text)]">{Math.round(value * 100)}%</p>
    </div>
  );
}
