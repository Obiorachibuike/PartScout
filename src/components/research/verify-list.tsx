"use client";

import { ShieldAlert, TriangleAlert } from "lucide-react";
import type { ResearchReport } from "@/types/research";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";

/**
 * Verify-before-install guidance plus the run's warnings (injection attempts,
 * sibling variants, degraded fetching, provider fallbacks…). Warnings are
 * surfaced verbatim from the pipeline — never hidden to make a verdict look
 * cleaner than the evidence supports.
 */
export function VerifyList({ report }: { report: ResearchReport }) {
  const hasVerify = report.verifyBeforeInstall.length > 0;
  const hasWarnings = report.warnings.length > 0;
  if (!hasVerify && !hasWarnings) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {hasVerify ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-[var(--ps-primary)]" aria-hidden />
              Verify before installing
            </CardTitle>
            <CardDescription>
              PartScout does not physically test parts. These are the checks that matter for this category before you
              commit the repair.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {report.verifyBeforeInstall.map((item) => (
                <li key={item} className="flex gap-2 rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-3">
                  <span aria-hidden className="text-[var(--ps-muted)]">□</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {hasWarnings ? (
        <Card className="border-[color-mix(in_oklab,var(--ps-warning)_35%,transparent)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TriangleAlert className="size-4 text-[var(--ps-warning)]" aria-hidden />
              Warnings from this research run
            </CardTitle>
            <CardDescription>
              Includes anything suspicious found in the retrieved pages (instruction-like text is neutralised and
              reported) and any degradation in the pipeline.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {report.warnings.map((warning) => (
                <li key={warning} className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-3">
                  {warning}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
