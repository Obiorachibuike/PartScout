"use client";

import { ExternalLink, Scale } from "lucide-react";
import type { ConflictRecord } from "@/types/research";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";

/**
 * Conflicting evidence is displayed explicitly, never averaged into a single
 * verdict. Both sides are shown with their domains, quotes and links.
 */
export function ConflictsPanel({ conflicts }: { conflicts: ConflictRecord[] }) {
  if (conflicts.length === 0) return null;

  return (
    <Card className="border-[color-mix(in_oklab,var(--ps-warning)_40%,transparent)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="size-4 text-[var(--ps-warning)]" aria-hidden />
          Conflicting sources ({conflicts.length})
        </CardTitle>
        <CardDescription>
          PartScout does not force a conclusion when sources disagree. Review both sides — and check the hardware
          revision, region and variant of the part you actually have.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {conflicts.map((conflict) => (
          <div key={conflict.topic} className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-4">
            <p className="text-sm font-semibold">{conflict.topic}</p>
            <p className="mt-1 text-xs text-[var(--ps-muted)]">{conflict.explanation}</p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <ConflictSide title="Supporting compatibility" entries={conflict.supporting} tone="success" />
              <ConflictSide title="Opposing compatibility" entries={conflict.opposing} tone="danger" />
            </div>

            {conflict.possibleExplanations.length > 0 ? (
              <div className="mt-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--ps-muted)]">
                  Possible explanations
                </p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-[var(--ps-muted)]">
                  {conflict.possibleExplanations.map((explanation) => (
                    <li key={explanation}>{explanation}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ConflictSide({
  title,
  entries,
  tone,
}: {
  title: string;
  entries: ConflictRecord["supporting"];
  tone: "success" | "danger";
}) {
  return (
    <div className="rounded-lg border border-[var(--ps-border)] p-3">
      <p
        className="text-xs font-semibold"
        style={{ color: tone === "success" ? "var(--ps-success)" : "var(--ps-danger)" }}
      >
        {title} ({entries.length})
      </p>
      {entries.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--ps-muted)]">No claims on this side.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {entries.map((entry) => (
            <li key={entry.claimId} className="text-xs">
              <a
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="ps-focus-ring inline-flex items-center gap-1 font-medium text-[var(--ps-text)] hover:underline"
              >
                {entry.domain}
                <ExternalLink className="size-3" aria-hidden />
              </a>
              <p className="mt-1 italic text-[var(--ps-muted)]">“{entry.text}”</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
