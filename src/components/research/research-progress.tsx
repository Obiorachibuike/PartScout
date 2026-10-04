"use client";

import { motion } from "framer-motion";
import { CircleCheck, CircleDashed, Loader2, TriangleAlert } from "lucide-react";
import type { ResearchStageEvent } from "@/types/research";
import { Progress } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/** Mirrors the `emit()` stage names in the research pipeline. */
const STAGE_ORDER = [
  "config",
  "understanding",
  "planning",
  "searching",
  "extracting",
  "evaluating",
  "evidence",
  "comparing",
  "compatibility",
  "confidence",
  "answer",
  "cache",
];

export function ResearchProgress({ stages, question }: { stages: ResearchStageEvent[]; question: string }) {
  const latest = stages[stages.length - 1];
  const completed = new Set(stages.filter((stage) => stage.status === "done" || stage.status === "skipped").map((s) => s.stage));
  const pct = Math.min(96, Math.round((completed.size / STAGE_ORDER.length) * 100));

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--ps-border)] bg-[var(--ps-surface)] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Researching the live web…</p>
          <p className="mt-0.5 max-w-xl truncate text-xs text-[var(--ps-muted)]">{question}</p>
        </div>
        <p className="text-xs text-[var(--ps-muted)]">{latest?.label ?? "Starting"}</p>
      </div>

      <Progress className="mt-4" value={pct} />

      <ol className="mt-4 space-y-2">
        {stages.map((stage, index) => {
          const isLast = index === stages.length - 1;
          return (
            <motion.li
              key={`${stage.stage}-${stage.at}`}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-start gap-2.5 text-sm"
            >
              <span className="mt-0.5">
                {stage.status === "error" ? (
                  <TriangleAlert className="size-4 text-[var(--ps-warning)]" aria-hidden />
                ) : stage.status === "done" || stage.status === "skipped" ? (
                  <CircleCheck className="size-4 text-[var(--ps-success)]" aria-hidden />
                ) : isLast && stage.status === "active" ? (
                  <Loader2 className="size-4 animate-spin text-[var(--ps-primary)]" aria-hidden />
                ) : (
                  <CircleDashed className="size-4 text-[var(--ps-muted)]" aria-hidden />
                )}
              </span>
              <span className={cn("min-w-0", stage.status === "active" ? "text-[var(--ps-text)]" : "text-[var(--ps-muted)]")}>
                <span className="font-medium text-[var(--ps-text)]">{stage.label}</span>
                {stage.detail ? <span className="ml-1.5">— {stage.detail}</span> : null}
              </span>
            </motion.li>
          );
        })}
      </ol>

      <p className="mt-4 text-[11px] text-[var(--ps-muted)]">
        Pages are fetched through SSRF-vetted requests, treated as untrusted evidence and never as instructions.
      </p>
    </div>
  );
}
