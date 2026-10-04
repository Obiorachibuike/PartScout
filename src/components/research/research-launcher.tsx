"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Input, Label } from "@/components/ui/primitives";
import { CapabilityBanner } from "@/components/common/capability-banner";
import { ResearchProgress } from "@/components/research/research-progress";
import { streamResearch } from "@/lib/research/stream-client";
import { readCookie, CSRF_COOKIE } from "@/lib/client/api";
import type { PublicError } from "@/lib/errors";
import type { ResearchReport, ResearchStageEvent } from "@/types/research";
import { PART_CATEGORY_LIST } from "@/lib/domain/parts";
import { cn } from "@/lib/utils";

export type LauncherMode = "auto" | "phone" | "part" | "compatibility";

interface LauncherProps {
  mode: LauncherMode;
  initialQuery?: string;
  /** Run immediately when the page loads with a question (hero hand-off). */
  autoRun?: boolean;
  presetPartCategory?: string;
}

/**
 * The research launcher.
 *
 * Streams the pipeline stages over SSE and hands the finished report to
 * `/results/[id]`. Errors (missing provider, rate limit, provider failure) are
 * surfaced with their remediation — PartScout never degrades into a fake answer.
 */
export function ResearchLauncher({ mode, initialQuery = "", autoRun = false, presetPartCategory }: LauncherProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Hero hand-off (/search?q=…&autorun=1): seed the question from the URL so the
  // one-shot auto-run effect below never has to set state.
  const autoRunRequested = autoRun || searchParams.get("autorun") === "1";
  const questionFromUrl = searchParams.get("q") ?? initialQuery;
  const [question, setQuestion] = React.useState(
    autoRunRequested && questionFromUrl.trim().length >= 3 ? questionFromUrl : initialQuery,
  );
  const [device, setDevice] = React.useState("");
  const [modelNumber, setModelNumber] = React.useState("");
  const [part, setPart] = React.useState(presetPartCategory ?? "");
  const [partNumber, setPartNumber] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [stages, setStages] = React.useState<ResearchStageEvent[]>([]);
  const [error, setError] = React.useState<PublicError | null>(null);
  const [report, setReport] = React.useState<ResearchReport | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const startedRef = React.useRef(false);

  const body = React.useMemo(() => {
    if (mode === "auto") return { mode, question };
    if (mode === "phone") return { mode, device, modelNumber, part, partNumber };
    if (mode === "part") return { mode, part, partNumber };
    return { mode, device, modelNumber, part, partNumber };
  }, [mode, question, device, modelNumber, part, partNumber]);

  const ready =
    mode === "auto"
      ? question.trim().length >= 3
      : mode === "part"
        ? part.trim().length >= 2 || partNumber.trim().length >= 2
        : device.trim().length >= 2 && (part.trim().length >= 2 || partNumber.trim().length >= 2 || mode === "phone");

  const run = React.useCallback(async () => {
    setError(null);
    setReport(null);
    setStages([]);
    setRunning(true);
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    try {
      const finished = await streamResearch({
        question,
        mode,
        payloadOverride: body,
        csrfToken: readCookie(CSRF_COOKIE),
        signal: controller.signal,
        handlers: {
          onStage: (stage) => setStages((current) => [...current, stage]),
          onError: (publicError) => setError(publicError),
        },
      });

      if (finished) {
        setReport(finished);
        router.push(`/results/${encodeURIComponent(finished.id)}`);
      } else if (!controller.signal.aborted) {
        setError((current) =>
          current ?? {
            code: "internal_error",
            message: "Research did not return a report. Please try again.",
            remediation: ["Retry the research.", "If it keeps failing, check the server logs."],
            retryable: true,
          },
        );
      }
    } catch (thrown) {
      setError({
        code: "network_error",
        message: thrown instanceof Error ? thrown.message : "Research failed unexpectedly.",
        remediation: ["Retry the research."],
        retryable: true,
      });
    } finally {
      setRunning(false);
    }
  }, [body, mode, question, router]);

  // Hero hand-off: run once when /search?q=…&autorun=1 is reached. The question
  // was already seeded from the URL above.
  React.useEffect(() => {
    if (startedRef.current) return;
    if (!autoRunRequested || mode !== "auto" || question.trim().length < 3) return;
    startedRef.current = true;
    // The hero hand-off is a one-shot kickoff (the URL equivalent of pressing
    // "Start research"), so the state updates inside run() are intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <div className="space-y-4">
      <CapabilityBanner />

      <Card className="p-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (ready && !running) void run();
          }}
          className="space-y-4"
        >
          {mode === "auto" ? (
            <div className="space-y-2">
              <Label htmlFor="question">Your research question</Label>
              <textarea
                id="question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={3}
                placeholder="e.g. Which phones use the Samsung Galaxy A15 4G charging flex, and does it fit the A15 5G?"
                className="ps-focus-ring w-full resize-none rounded-2xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] px-4 py-3.5 text-[15px] leading-relaxed placeholder:text-[var(--ps-muted)]/70"
              />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {mode !== "part" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="device">Phone / device family *</Label>
                    <Input
                      id="device"
                      value={device}
                      onChange={(event) => setDevice(event.target.value)}
                      placeholder="Samsung Galaxy A15 4G"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="modelNumber">Exact model number (optional)</Label>
                    <Input
                      id="modelNumber"
                      value={modelNumber}
                      onChange={(event) => setModelNumber(event.target.value)}
                      placeholder="SM-A155F"
                      autoComplete="off"
                    />
                  </div>
                </>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="part">{mode === "part" ? "Part number or name *" : "Part *"}</Label>
                <Input
                  id="part"
                  value={part}
                  onChange={(event) => setPart(event.target.value)}
                  placeholder={mode === "part" ? "BN5A battery" : "charging flex"}
                  autoComplete="off"
                  list="part-categories"
                />
                <datalist id="part-categories">
                  {PART_CATEGORY_LIST.filter((definition) => definition.id !== "other").map((definition) => (
                    <option key={definition.id} value={definition.id}>
                      {definition.label}
                    </option>
                  ))}
                </datalist>
              </div>

              <div className="space-y-2">
                <Label htmlFor="partNumber">OEM part number (optional)</Label>
                <Input
                  id="partNumber"
                  value={partNumber}
                  onChange={(event) => setPartNumber(event.target.value)}
                  placeholder="GH82-31234A"
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" loading={running} disabled={!ready}>
              {running ? "Researching…" : "Start research"}
            </Button>
            {running ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  abortRef.current?.abort();
                  setRunning(false);
                }}
              >
                Cancel
              </Button>
            ) : null}
            <p className="text-xs text-[var(--ps-muted)]">
              Live web research usually takes 20–60 seconds depending on the provider.
            </p>
          </div>
        </form>
      </Card>

      {error ? (
        <Card className="border-[color-mix(in_oklab,var(--ps-danger)_45%,transparent)] p-5">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 size-4 text-[var(--ps-danger)]" aria-hidden />
            <div className="space-y-2">
              <p className="text-sm font-semibold">{error.message}</p>
              {error.remediation.length > 0 ? (
                <ul className="list-inside list-disc space-y-1 text-xs text-[var(--ps-muted)]">
                  {error.remediation.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              ) : null}
              {error.retryable ? (
                <Button size="sm" variant="secondary" onClick={() => void run()} disabled={running}>
                  Retry research
                </Button>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}

      {stages.length > 0 && !report ? (
        <ResearchProgress stages={stages} question={question || describeFields(mode, { device, part, partNumber })} />
      ) : null}

      <p className={cn("text-[11px] text-[var(--ps-muted)]", stages.length === 0 ? "" : "hidden")}>
        PartScout searches licensed APIs only — it never scrapes Google, Bing or Yahoo result pages.
      </p>
    </div>
  );
}

function describeFields(
  mode: LauncherMode,
  fields: { device: string; part: string; partNumber: string },
): string {
  if (mode === "part") return `${fields.partNumber || fields.part}`.trim();
  return `${fields.part || fields.partNumber} — ${fields.device}`.trim();
}
