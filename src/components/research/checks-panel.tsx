"use client";

import { Check, CircleHelp, TriangleAlert, X } from "lucide-react";
import type { CompatibilityCheck, VariantRisk } from "@/types/research";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { checkStatusMeta } from "@/lib/research/verdict-ui";

const ICONS = {
  success: Check,
  danger: X,
  warning: TriangleAlert,
  muted: CircleHelp,
} as const;

export function ChecksPanel({ checks, variantRisks }: { checks: CompatibilityCheck[]; variantRisks: VariantRisk[] }) {
  if (checks.length === 0 && variantRisks.length === 0) return null;

  return (
    <div className="space-y-4">
      {checks.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Why — category checklist</CardTitle>
            <CardDescription>
              Each part category has its own checks. A “supported” status means the sources speak to that dimension; a
              check that stays “unknown” is a real gap, not a pass. There is deliberately no “same size = compatible”
              rule anywhere in this list.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {checks.map((check) => {
                const meta = checkStatusMeta(check.status);
                const Icon = ICONS[meta.tone];
                return (
                  <li
                    key={check.id}
                    className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-3.5"
                  >
                    <div className="flex items-center gap-2">
                      <Icon
                        className="size-4 shrink-0"
                        style={{
                          color:
                            meta.tone === "success"
                              ? "var(--ps-success)"
                              : meta.tone === "danger"
                                ? "var(--ps-danger)"
                                : meta.tone === "warning"
                                  ? "var(--ps-warning)"
                                  : "var(--ps-muted)",
                        }}
                        aria-hidden
                      />
                      <span className="text-sm font-medium">{check.label}</span>
                      <Badge
                        tone={meta.tone === "muted" ? "muted" : meta.tone}
                        className="ml-auto text-[10px]"
                      >
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--ps-muted)]">{check.detail}</p>
                    <p className="mt-1.5 text-[11px] text-[var(--ps-muted)]/80">{check.rationale}</p>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {variantRisks.length > 0 ? (
        <Card className="border-[color-mix(in_oklab,var(--ps-warning)_35%,transparent)]">
          <CardHeader>
            <CardTitle>Variant warnings</CardTitle>
            <CardDescription>
              These sources describe a sibling variant of the requested device. PartScout keeps them visible instead of
              silently treating them as a match.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {variantRisks.map((risk) => (
                <li key={`${risk.requestedVariant}-${risk.evidenceVariant}-${risk.deviceLabel}`} className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-3.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge tone="warning" className="text-[10px]">
                      requested: {risk.requestedVariant}
                    </Badge>
                    <span className="text-[var(--ps-muted)]">vs</span>
                    <Badge tone="muted" className="text-[10px]">
                      evidence: {risk.evidenceVariant}
                    </Badge>
                    <span className="font-medium">{risk.deviceLabel}</span>
                    {risk.modelNumbers.map((model) => (
                      <Badge key={model} tone="muted" className="font-mono text-[10px]">
                        {model}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-[var(--ps-muted)]">{risk.message}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
