import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@/components/layout/page-shell";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SEARCH_PROVIDER_DESCRIPTORS } from "@/lib/providers/search/SearchProvider";
import { cacheConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "About & methodology",
  description:
    "How PartScout researches phone part compatibility: search → extraction → evidence → scoring → confidence. No hand-maintained compatibility database and no AI-guessed answers.",
  alternates: { canonical: "/about" },
};

const PIPELINE = [
  {
    step: "1 · Query understanding",
    body: "The request is parsed deterministically into intent, device family, model numbers, variant markers, part concept and part number. An AI pass may fill gaps, but it can never introduce a model number that is not in your question.",
  },
  {
    step: "2 · Query generation",
    body: "Four to ten targeted queries are generated per run: device→part, part→phones, exact model numbers, OEM part numbers, specification angles and community angles. One search is never enough.",
  },
  {
    step: "3 · Live web search",
    body: "Queries run through a licensed search API behind the SearchProvider interface (Tavily, Exa, Serper or Brave). Google/Bing/Yahoo SERP scraping is explicitly not implemented.",
  },
  {
    step: "4 · Content extraction",
    body: "Pages are fetched with SSRF vetting, byte caps and timeouts, then reduced to readable text. Provider-supplied content is used when available; otherwise pages are fetched — and when a fetch is blocked the source is labelled metadata-only.",
  },
  {
    step: "5 · Source quality scoring",
    body: "Each source is placed in a tier (T1 manufacturer/official → T4 marketplace/forum) and scored on authority, relevance, directness, model specificity, part specificity, recency, independence and whether it makes an explicit claim.",
  },
  {
    step: "6 · Evidence extraction",
    body: "Pages are segmented and scanned for short spans containing (device + part + claim). The output is structured claims — device, model numbers, variant markers, part, part number, verbatim quote, strength — never “this page is useful”.",
  },
  {
    step: "7 · Claim normalisation",
    body: "Claims are keyed by device family and variant. Galaxy A15 4G, A15 5G and SM-A155F remain distinct identities; variants conflict rather than silently merging.",
  },
  {
    step: "8 · Compatibility reasoning",
    body: "A deterministic engine groups claims against the requested target, runs the category checklist (connector, flex layout, revision, panel technology…) and records conflicts instead of resolving them by decree.",
  },
  {
    step: "9 · Confidence",
    body: "Evidence confidence combines source quality, independent domains, agreement, technical specificity, part-number support and high-quality coverage, minus conflict and volume penalties.",
  },
  {
    step: "10 · Answer",
    body: "The answer is written from the engine output. An AI rewrite is optional and is discarded if it introduces model numbers that are not in the evidence or contradicts the verdict.",
  },
];

export default function AboutPage() {
  return (
    <PageShell
      wide
      eyebrow="About PartScout"
      title="Find the right part. Verify compatibility."
      description="PartScout is a research tool for phone repair technicians. It searches the live public web the moment you ask, extracts evidence, and tells you how strong that evidence is — including when it is not strong enough to answer."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>The ten-stage research pipeline</CardTitle>
            <CardDescription>
              Every run streams these stages to the results page so you can see exactly what was searched and read.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {PIPELINE.map((entry) => (
                <li key={entry.step} className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-3.5">
                  <p className="text-sm font-semibold">{entry.step}</p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--ps-muted)]">{entry.body}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>What PartScout will not do</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-[var(--ps-muted)]">
              <p>• It will not guess compatibility from model knowledge.</p>
              <p>• It will not scrape Google, Bing or Yahoo result pages.</p>
              <p>• It will not merge 4G, 5G or regional variants into one answer.</p>
              <p>• It will not fabricate a URL, quote, part number or model number.</p>
              <p>• It will not hide a conflicting source to look decisive.</p>
              <p>• It will not claim a laboratory guarantee.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Search providers</CardTitle>
              <CardDescription>Choose one with SEARCH_PROVIDER; keys stay in your environment.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {SEARCH_PROVIDER_DESCRIPTORS.map((provider) => (
                  <li key={provider.id} className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{provider.label}</span>
                      <Badge tone="muted" className="font-mono text-[10px]">
                        {provider.id}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-[var(--ps-muted)]">{provider.notes}</p>
                    <p className="mt-1 font-mono text-[10px] text-[var(--ps-muted)]">{provider.apiKeyEnvVar}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Caching</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-[var(--ps-muted)]">
              <p>Research reports are cached for {Math.round(cacheConfig.researchTtlMinutes / 60)} hours, page text for {Math.round(cacheConfig.sourceTtlMinutes / 60)} hours and provider search responses for {Math.round(cacheConfig.searchTtlMinutes / 60)} hours.</p>
              <p>“Refresh research” clears the cached report and re-runs the pipeline live.</p>
              <p className="font-mono text-[11px]">pipeline {cacheConfig.pipelineVersion}</p>
            </CardContent>
          </Card>

          <Button asChild variant="secondary" className="w-full">
            <Link href="/help">Setup and troubleshooting</Link>
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
