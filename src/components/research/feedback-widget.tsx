"use client";

import * as React from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { apiFetch } from "@/lib/client/api";
import { cn } from "@/lib/utils";

const REASONS = [
  { id: "wrong_phone", label: "Wrong phone/model" },
  { id: "wrong_part", label: "Wrong part" },
  { id: "wrong_compatibility", label: "Compatibility answer looks wrong" },
  { id: "poor_source", label: "Sources were weak" },
  { id: "insufficient_evidence", label: "Not enough evidence" },
  { id: "other", label: "Something else" },
] as const;

/** “Was this research useful?” plus structured failure reasons for the admin dashboard. */
export function FeedbackWidget({ researchId }: { researchId: string | null }) {
  const [stage, setStage] = React.useState<"ask" | "reason" | "done">("ask");
  const [helpful, setHelpful] = React.useState<boolean | null>(null);
  const [reason, setReason] = React.useState<string | null>(null);
  const [comment, setComment] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const send = async (input: { helpful: boolean; reason?: string | null; comment?: string | null }) => {
    setSending(true);
    try {
      const result = await apiFetch("/api/feedback", {
        method: "POST",
        body: { researchId, helpful: input.helpful, reason: input.reason ?? null, comment: input.comment ?? null },
      });
      if (!result.ok) {
        toast.error(result.error?.message ?? "Could not send feedback");
        return false;
      }
      return true;
    } finally {
      setSending(false);
    }
  };

  if (stage === "done") {
    return (
      <Card className="p-4 text-sm text-[var(--ps-muted)]">
        Thanks — feedback like this directly shapes what PartScout researches next.
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <p className="text-sm font-medium">Was this research useful?</p>
      <p className="mt-1 text-xs text-[var(--ps-muted)]">
        Feedback is stored against this research session only — it never changes a compatibility result.
      </p>

      {stage === "ask" ? (
        <div className="mt-3 flex gap-2">
          <Button
            variant={helpful === true ? "primary" : "secondary"}
            size="sm"
            loading={sending && helpful === true}
            onClick={async () => {
              setHelpful(true);
              const ok = await send({ helpful: true });
              if (ok) {
                setStage("done");
                toast.success("Thanks for the feedback");
              }
            }}
          >
            <ThumbsUp aria-hidden />
            Yes
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setStage("reason")}
            aria-haspopup="true"
          >
            <ThumbsDown aria-hidden />
            Not really
          </Button>
        </div>
      ) : null}

      {stage === "reason" ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setReason(option.id)}
                className={cn(
                  "ps-focus-ring rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  reason === option.id
                    ? "border-transparent bg-[var(--ps-primary)] text-white"
                    : "border-[var(--ps-border)] text-[var(--ps-muted)] hover:text-[var(--ps-text)]",
                )}
                aria-pressed={reason === option.id}
              >
                {option.label}
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value.slice(0, 1_000))}
            rows={2}
            placeholder="Anything else? (optional)"
            className="ps-focus-ring w-full resize-none rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] px-3 py-2 text-sm"
          />
          <Button
            size="sm"
            loading={sending}
            disabled={!reason}
            onClick={async () => {
              setHelpful(false);
              const ok = await send({ helpful: false, reason, comment: comment.trim() || null });
              if (ok) {
                setStage("done");
                toast.success("Thanks — this helps us improve");
              }
            }}
          >
            Send feedback
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
