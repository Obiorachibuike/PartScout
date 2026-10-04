"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import type { NormalizedClaim } from "@/types/research";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, { label: string; tone: "success" | "danger" | "warning" | "muted" }> = {
  compatible: { label: "compatible", tone: "success" },
  not_compatible: { label: "not compatible", tone: "danger" },
  unclear: { label: "unclear", tone: "warning" },
  spec_only: { label: "spec only", tone: "muted" },
};

/** The raw evidence trail: every claim with its quote, device, part and source. */
export function ClaimsExplorer({ claims }: { claims: NormalizedClaim[] }) {
  const [filter, setFilter] = React.useState<"all" | "compatible" | "not_compatible" | "unclear">("all");

  if (claims.length === 0) return null;
  const filtered = filter === "all" ? claims : claims.filter((claim) => claim.claim === filter);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Evidence claims ({claims.length})</CardTitle>
            <CardDescription>
              Short, verbatim extracts — not whole pages. Each claim records the device string as written, the model
              numbers it cites and how strong the phrasing was.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: "all", label: "All" },
                { id: "compatible", label: "Compatible" },
                { id: "not_compatible", label: "Not compatible" },
                { id: "unclear", label: "Unclear" },
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
      <CardContent>
        <ul className="space-y-2">
          {filtered.map((claim) => {
            const kind = KIND_LABEL[claim.claim] ?? KIND_LABEL.unclear!;
            return (
              <li key={claim.id} className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={kind.tone} className="text-[10px]">
                    {kind.label}
                  </Badge>
                  <span className="text-xs font-medium">{claim.deviceCanonical ?? claim.deviceRaw ?? "device not stated"}</span>
                  {claim.modelNumbers.map((model) => (
                    <Badge key={model} tone="muted" className="font-mono text-[10px]">
                      {model}
                    </Badge>
                  ))}
                  {claim.variantMarkers.map((marker) => (
                    <Badge key={marker} tone="primary" className="text-[10px] uppercase">
                      {marker}
                    </Badge>
                  ))}
                  <span className="ml-auto text-[10px] text-[var(--ps-muted)]">
                    strength {Math.round(claim.strength * 100)}% · {claim.evidenceStrength}
                  </span>
                </div>

                <blockquote className="mt-2 border-l-2 border-[var(--ps-border-strong)] pl-3 text-xs italic leading-relaxed text-[var(--ps-muted)]">
                  “{claim.evidenceText}”
                </blockquote>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--ps-muted)]">
                  <span>
                    Part: <span className="text-[var(--ps-text)]">{claim.partCanonical ?? claim.partRaw ?? "not stated"}</span>
                  </span>
                  {claim.partNumber ? (
                    <Badge tone="muted" className="font-mono text-[10px]">
                      {claim.partNumber}
                    </Badge>
                  ) : null}
                  <a
                    href={claim.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="ps-focus-ring ml-auto inline-flex items-center gap-1 hover:text-[var(--ps-text)] hover:underline"
                  >
                    {claim.sourceDomain}
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                </div>

                {Object.keys(claim.attributes).length > 0 ? (
                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--ps-muted)]">
                    {Object.entries(claim.attributes).map(([key, value]) => (
                      <span key={key}>
                        <span className="opacity-80">{key}:</span> {value}
                      </span>
                    ))}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
