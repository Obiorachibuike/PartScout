"use client";

import type { ConfidenceResult } from "@/types/research";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { levelMeta } from "@/lib/research/verdict-ui";

const COMPONENTS: Array<{ key: keyof ConfidenceResult["breakdown"]; label: string; description: string }> = [
  { key: "sourceQuality", label: "Source quality", description: "Weighted tier, authority and relevance of the pages that produced claims." },
  { key: "independentSources", label: "Independence", description: "Distinct domains — three different suppliers beat one page repeated three times." },
  { key: "claimAgreement", label: "Agreement", description: "How much of the claim weight points the same way." },
  { key: "technicalSpecificity", label: "Technical specificity", description: "How much of the category checklist the evidence actually resolves." },
  { key: "conflictsPenalty", label: "Conflict penalty", description: "Applied when sources contradict each other." },
  { key: "evidenceVolumePenalty", label: "Volume penalty", description: "Applied when there is very little evidence to work with." },
];

export function ConfidenceView({ confidence }: { confidence: ConfidenceResult }) {
  const level = levelMeta(confidence.level);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Evidence confidence: {confidence.score}% <span style={{ color: level.color }}>{level.emoji}</span>
        </CardTitle>
        <CardDescription>{confidence.summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-3">
          {COMPONENTS.map((component) => {
            const raw = confidence.breakdown[component.key] ?? 0;
            const isPenalty = component.key.includes("Penalty");
            const value = Math.max(0, Math.min(1, raw));
            return (
              <li key={component.key}>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-medium text-[var(--ps-text)]">{component.label}</span>
                  <span className="font-mono text-[var(--ps-muted)]">
                    {isPenalty ? `−${Math.round(value * 100)}%` : `${Math.round(value * 100)}%`}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--ps-surface-3)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${value * 100}%`,
                      background: isPenalty ? "var(--ps-warning)" : "var(--ps-primary)",
                    }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-[var(--ps-muted)]">{component.description}</p>
              </li>
            );
          })}
        </ul>

        {confidence.rationale.length > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--ps-muted)]">How this score was reached</p>
            <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs text-[var(--ps-muted)]">
              {confidence.rationale.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-3 text-[11px] leading-relaxed text-[var(--ps-muted)]">
          {confidence.disclaimer}
        </p>
      </CardContent>
    </Card>
  );
}
