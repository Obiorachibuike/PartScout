"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck, RefreshCw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client/api";
import { useSession } from "@/components/providers/session-provider";
import type { ResearchReport } from "@/types/research";

/**
 * Refresh ("PartScout researched this recently" → re-run), save, and copy link.
 * Refresh drops the cached report and streams a fresh run of the pipeline, so the
 * user always sees where the new answer came from.
 */
export function ReportActions({ report }: { report: ResearchReport }) {
  const router = useRouter();
  const { user } = useSession();
  const [refreshing, setRefreshing] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const result = await apiFetch<{ invalidated: boolean; report: ResearchReport | null }>("/api/cache/refresh", {
        method: "POST",
        body: { cacheKey: report.cacheKey },
      });
      if (!result.ok) {
        toast.error(result.error?.message ?? "Could not refresh this research");
        return;
      }
      toast.success("Cache cleared — starting a fresh research run");
      const response = await fetch("/api/research/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: report.question, mode: report.intent, forceRefresh: true }),
      });
      if (!response.ok || !response.body) {
        toast.error("Fresh research could not start. Please try again.");
        return;
      }
      // Consume the stream and jump to the refreshed report when it finishes.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          if (!frame.startsWith("event: report")) continue;
          const data = frame.split("\n").find((line) => line.startsWith("data:"));
          if (!data) continue;
          const fresh = JSON.parse(data.slice(5).trim()) as ResearchReport;
          router.replace(`/results/${encodeURIComponent(fresh.id)}`);
          return;
        }
      }
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  };

  const save = async () => {
    if (!user) {
      toast.error("Sign in to save research");
      return;
    }
    setSaving(true);
    try {
      const result = await apiFetch("/api/saved", {
        method: "POST",
        body: {
          label: report.headline.slice(0, 180),
          query: report.question.slice(0, 500),
          mode: report.intent === "part_to_phones" ? "part" : report.intent === "compatibility_check" ? "compatibility" : "auto",
          researchId: report.id,
        },
      });
      if (!result.ok) {
        toast.error(result.error?.message ?? "Could not save this research");
        return;
      }
      setSaved(true);
      toast.success("Saved to your research list");
    } finally {
      setSaving(false);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/results/${report.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: report.headline, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" loading={refreshing} onClick={() => void refresh()}>
        <RefreshCw aria-hidden />
        Refresh research
      </Button>
      <Button variant="secondary" size="sm" loading={saving} onClick={() => void save()} disabled={saved}>
        {saved ? <BookmarkCheck aria-hidden /> : <Bookmark aria-hidden />}
        {saved ? "Saved" : "Save"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => void share()}>
        <Share2 aria-hidden />
        Share
      </Button>
    </div>
  );
}
