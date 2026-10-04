"use client";

import { ExternalLink, PackageSearch } from "lucide-react";
import type { ResearchReport } from "@/types/research";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";

/**
 * Compatible parts (phone → parts direction).
 *
 * A part only appears here when a source explicitly claims it fits the queried
 * device; the entry shows the part number the source used and how many domains
 * back it.
 */
export function RecommendedParts({ report }: { report: ResearchReport }) {
  if (report.compatibleParts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PackageSearch className="size-4 text-[var(--ps-primary)]" aria-hidden />
          Parts the evidence says fit {report.plan.device ?? "this device"}
        </CardTitle>
        <CardDescription>
          Sorted by how much independent evidence supports each part. “{report.compatibleParts.length} finding
          {report.compatibleParts.length === 1 ? "" : "s"}” is what the sources stated — not a catalogue PartScout
          maintains.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {report.compatibleParts.map((finding) => (
            <li
              key={`${finding.partName}-${finding.partNumber ?? "no-number"}-${finding.device}`}
              className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-3.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{finding.partName}</span>
                {finding.partNumber ? (
                  <Badge tone="muted" className="font-mono text-[10px]">
                    {finding.partNumber}
                  </Badge>
                ) : null}
                <Badge tone="primary" className="text-[10px]">
                  {finding.partCategory.replace(/_/g, " ")}
                </Badge>
                <span className="ml-auto text-[11px] text-[var(--ps-muted)]">
                  {finding.independentSources} source{finding.independentSources === 1 ? "" : "s"} ·{" "}
                  {Math.round(finding.averageSourceQuality * 100)}% quality
                </span>
              </div>

              <p className="mt-1.5 text-xs text-[var(--ps-muted)]">
                Evidence from:{" "}
                {finding.supportingDomains.map((domain, index) => (
                  <span key={domain}>
                    {index > 0 ? ", " : ""}
                    <a
                      className="ps-focus-ring rounded underline-offset-2 hover:underline"
                      href={finding.supportingClaimIds[0] ? `#claim-${finding.supportingClaimIds[0]}` : "#claims"}
                    >
                      {domain}
                    </a>
                  </span>
                ))}
              </p>

              {Object.keys(finding.attributes).length > 0 ? (
                <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--ps-muted)]">
                  {Object.entries(finding.attributes).map(([key, value]) => (
                    <span key={key}>
                      <span className="opacity-80">{key}:</span> {value}
                    </span>
                  ))}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-[var(--ps-muted)]">
          Part numbers are quoted exactly as a source printed them; always compare against the number on your part.{" "}
          <ExternalLink className="inline size-3" aria-hidden /> links in the source list open the original pages.
        </p>
      </CardContent>
    </Card>
  );
}
