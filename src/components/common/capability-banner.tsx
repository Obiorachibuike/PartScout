"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Info, X } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";

/**
 * Shows exactly what is misconfigured on this deployment.
 *
 * PartScout never fakes research: when a provider key is missing the UI says so
 * (and explains how to fix it) instead of returning invented compatibility data.
 */
export function CapabilityBanner() {
  const { capabilities } = useSession();
  const [dismissed, setDismissed] = React.useState(false);

  if (dismissed || capabilities.setupIssues.length === 0) return null;

  const blocking = !capabilities.searchConfigured;

  return (
    <div
      className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6"
      role="status"
      aria-live="polite"
    >
      <div
        className="flex items-start gap-3 rounded-2xl border p-3.5 text-sm"
        style={{
          borderColor: blocking
            ? "color-mix(in oklab, var(--ps-warning) 45%, transparent)"
            : "color-mix(in oklab, var(--ps-info) 40%, transparent)",
          background: blocking
            ? "color-mix(in oklab, var(--ps-warning) 12%, transparent)"
            : "color-mix(in oklab, var(--ps-info) 10%, transparent)",
        }}
      >
        <span className="mt-0.5 shrink-0">
          {blocking ? (
            <AlertTriangle className="size-4 text-[var(--ps-warning)]" aria-hidden />
          ) : (
            <Info className="size-4 text-[var(--ps-info)]" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium">
            {blocking ? "PartScout is not connected to a search provider yet" : "Deployment notes"}
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-[var(--ps-muted)]">
            {capabilities.setupIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          <p className="text-xs text-[var(--ps-muted)]">
            Setup details live in <code className="rounded bg-[var(--ps-surface-3)] px-1">.env.example</code> and the
            README. PartScout never returns invented compatibility data while unconfigured —{" "}
            <Link href="/help#configuration" className="underline">
              see the setup guide
            </Link>
            .
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={() => setDismissed(true)}>
          <X aria-hidden />
        </Button>
      </div>
    </div>
  );
}
