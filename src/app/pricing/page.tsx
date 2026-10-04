import Link from "next/link";
import type { Metadata } from "next";
import { Check } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { PLAN_DEFINITIONS } from "@/lib/plans";
import { limits } from "@/lib/config";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "PartScout pricing: a free tier for occasional checks and higher limits for busy repair benches. Live-web compatibility research with cited sources on every plan.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <PageShell
      wide
      eyebrow="Pricing"
      title="Pay for research volume, not for a compatibility database"
      description="Every plan runs the same pipeline: live-web search, structured evidence, confidence scoring and cited sources. PartScout never sells access to a hand-maintained mapping."
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {PLAN_DEFINITIONS.map((plan) => (
          <Card
            key={plan.id}
            className={
              plan.highlighted
                ? "border-[color-mix(in_oklab,var(--ps-primary)_55%,transparent)] shadow-[var(--shadow-float)]"
                : undefined
            }
          >
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>{plan.name}</CardTitle>
                {plan.highlighted ? <Badge tone="primary">Most popular</Badge> : null}
              </div>
              <CardDescription>{plan.tagline}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="flex items-baseline gap-1">
                <span className="text-3xl font-semibold tabular-nums">
                  {plan.priceMonthlyUsd === 0 ? "Free" : `$${plan.priceMonthlyUsd}`}
                </span>
                {plan.priceMonthlyUsd > 0 ? <span className="text-sm text-[var(--ps-muted)]">/month</span> : null}
              </p>

              <ul className="space-y-2 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--ps-success)]" aria-hidden />
                    <span className="text-[var(--ps-muted)]">{feature}</span>
                  </li>
                ))}
              </ul>

              <p className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-3 text-xs text-[var(--ps-muted)]">
                {plan.dailyResearches} research runs/day · {plan.maxQueriesPerResearch} search queries per run
              </p>

              <Button asChild variant={plan.highlighted ? "primary" : "secondary"} className="w-full">
                <Link href={plan.id === "FREE" ? "/search" : "/register?next=/profile"}>
                  {plan.id === "FREE" ? "Start researching" : `Choose ${plan.name}`}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="mt-10 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>How cost control works</CardTitle>
            <CardDescription>
              Research is expensive when it is unbounded, so limits are explicit and enforced in the pipeline.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-[var(--ps-muted)]">
              <li>At most {limits.maxQueriesPerResearch} search queries and {limits.maxPagesToFetch} page fetches per research run.</li>
              <li>Fast models handle query planning and claim extraction; the smart tier is used only for the final phrasing and complex reasoning.</li>
              <li>Search, page and report caches with TTLs mean repeated questions cost nothing until the cache is refreshed.</li>
              <li>{limits.maxResearchesPerHourPerIp} runs per hour per IP by default — configurable per deployment.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bring your own keys</CardTitle>
            <CardDescription>Self-hosting PartScout means you pay providers directly, at cost.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-[var(--ps-muted)]">
              <li>Search: Tavily, Exa, Serper or Brave behind one swappable interface.</li>
              <li>Reasoning: OpenAI, Gemini or Anthropic — or none, in which case PartScout still researches and answers deterministically.</li>
              <li>Usage telemetry per run shows search calls, page fetches and AI tokens with an estimated cost.</li>
            </ul>
            <Button asChild variant="secondary" size="sm" className="mt-4">
              <Link href="/about">Read the architecture</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <p className="mt-8 rounded-2xl border border-[var(--ps-border)] bg-[var(--ps-surface-2)] p-4 text-xs text-[var(--ps-muted)]">
        PartScout does not test parts. It reports what published sources state, with an evidence confidence score and the
        sources attached, so you can judge the risk yourself before fitting a part.
      </p>
    </PageShell>
  );
}
