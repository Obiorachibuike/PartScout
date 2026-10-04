import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Collapsible } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { getCapabilities } from "@/lib/config";
import { isDatabaseConfigured } from "@/lib/db/client";

export const metadata: Metadata = {
  title: "Help & troubleshooting",
  description:
    "Set up PartScout, read the confidence scale correctly, and troubleshoot empty results, provider errors, rate limits and timeouts.",
  alternates: { canonical: "/help" },
};

const FAQ = [
  {
    q: "Why did PartScout say it could not find enough evidence?",
    a: "Because the public pages it could reach did not contain a specific statement about your part and device. That is a real answer, not an error. Add the exact model number (for example SM-A155F) or the OEM part number, and re-run. Manufacturer documentation and supplier catalogues are the most likely places to hold that statement.",
  },
  {
    q: "How should I read the evidence confidence percentage?",
    a: "It expresses how strong the evidence trail is: source quality and tier, how many independent domains agree, how specific the claims are, whether the part number is cited, and how much of the category checklist the evidence resolves. It is not a probability that the part physically fits — always verify before installing.",
  },
  {
    q: "A source is listed as “metadata only” — what does that mean?",
    a: "The provider returned the page in search results, but PartScout could not retrieve and read the page body (paywall, block, non-HTML content or a timeout). That source can still be opened manually, but it did not contribute extractable evidence.",
  },
  {
    q: "The verdict is “uncertain” but the part fits in my experience.",
    a: "Uncertain means the retrieved evidence conflicts or only covers sibling variants — it is not a denial. Open the Conflicts panel to see which checkpoint the sources disagree on (connector, panel revision, variant) and check the part in your hand against that detail.",
  },
  {
    q: "Can PartScout check a part I photographed?",
    a: "Yes, on the Identify page — provided the deployment has a vision-capable AI provider configured. PartScout reads the printed identifier, shows you exactly what it read, and lets you correct it before researching. It never decides compatibility from the photo.",
  },
  {
    q: "Does PartScout keep a compatibility database?",
    a: "No. There is deliberately no table of compatibility mappings and no admin screen to enter one. Answers are produced by researching the live web at the moment you ask, then cached for a short TTL so repeat questions are cheap.",
  },
  {
    q: "Why do I see a “fixture data” badge?",
    a: "Fixtures are synthetic pages used by the test-suite and for offline UI work. They are hard-disabled in production and every fixture-backed report is labelled — real research is never presented as a fixture, and fixtures are never presented as real research.",
  },
  {
    q: "I hit a rate limit.",
    a: "Per-IP limits protect the search and AI budgets (20 research runs and 10 identifications per hour by default). Wait a few minutes, or raise MAX_RESEARCHES_PER_HOUR_PER_IP on your own deployment.",
  },
];

const TROUBLESHOOTING = [
  {
    problem: "Every research returns zero sources",
    cause: "No usable search provider, or the provider key is invalid.",
    fix: "Check /api/health and the banner on the homepage. Set SEARCH_PROVIDER to tavily | exa | serper | brave and provide the matching API key.",
  },
  {
    problem: "Research fails with a timeout",
    cause: "Provider latency or many slow pages.",
    fix: "Lower MAX_PAGES_TO_FETCH, raise RESEARCH_TIMEOUT_MS, or run with a faster provider region.",
  },
  {
    problem: "History, saved searches and feedback do not persist",
    cause: "DATABASE_URL is not set or migrations have not been applied.",
    fix: "Set DATABASE_URL, run npm run db:generate then npm run db:deploy, and reload /api/health.",
  },
  {
    problem: "Photo identification says vision is unavailable",
    cause: "AI_PROVIDER is none or its key is missing.",
    fix: "Set AI_PROVIDER=openai|gemini|anthropic and the matching API key; VISION_MODEL can pin a specific model.",
  },
  {
    problem: "A page looks like it tried to instruct the model",
    cause: "Prompt-injection attempt inside retrieved content.",
    fix: "Nothing to do: instruction-like text is neutralised, flagged in the warnings panel, and can never change a verdict. Treat such a source as unreliable.",
  },
];

export default function HelpPage() {
  const capabilities = getCapabilities({ databaseConfigured: isDatabaseConfigured() });

  return (
    <PageShell
      wide
      eyebrow="Help"
      title="How to use PartScout — and how to fix a deployment"
      description="PartScout answers from evidence. Understanding what it can and cannot see is the fastest way to get a useful answer."
    >
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Frequently asked questions</h2>
          {FAQ.map((entry, index) => (
            <Collapsible key={entry.q} summary={<span>{entry.q}</span>} defaultOpen={index === 0}>
              <p className="leading-relaxed">{entry.a}</p>
            </Collapsible>
          ))}

          <h2 id="configuration" className="pt-4 text-lg font-semibold">
            Deployment configuration
          </h2>
          <Card>
            <CardHeader>
              <CardTitle>Current deployment state</CardTitle>
              <CardDescription>
                Read live from the environment. PartScout never fakes research when something is missing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm">
                <li>
                  Search provider: <code>{capabilities.searchProvider ?? "none"}</code>{" "}
                  {capabilities.searchConfigured ? "✅ configured" : "❌ missing key"}
                </li>
                <li>
                  AI reasoning: <code>{capabilities.aiProvider}</code>{" "}
                  {capabilities.aiConfigured ? "✅ configured (optional)" : "⚪ not configured (deterministic engine only)"}
                </li>
                <li>
                  Database: {capabilities.databaseConfigured ? "✅ configured" : "⚪ not configured (no history/cache persistence)"}
                </li>
                <li>Google sign-in: {capabilities.googleOAuthConfigured ? "✅ configured" : "⚪ disabled"}</li>
              </ul>
              {capabilities.setupIssues.length > 0 ? (
                <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-[var(--ps-muted)]">
                  {capabilities.setupIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="secondary" size="sm">
                  <a href="/api/health">Open health JSON</a>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/about">Architecture</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <h2 className="pt-4 text-lg font-semibold">Troubleshooting</h2>
          {TROUBLESHOOTING.map((entry) => (
            <Collapsible key={entry.problem} summary={<span>{entry.problem}</span>}>
              <p>
                <span className="font-medium text-[var(--ps-text)]">Likely cause: </span>
                {entry.cause}
              </p>
              <p className="mt-1">
                <span className="font-medium text-[var(--ps-text)]">Fix: </span>
                {entry.fix}
              </p>
            </Collapsible>
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Getting a precise answer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[var(--ps-muted)]">
              <p>
                <span className="text-[var(--ps-text)]">Include the exact model number.</span> “Galaxy A15 4G SM-A155F”
                beats “Galaxy A15” because supplier lists are written per SKU.
              </p>
              <p>
                <span className="text-[var(--ps-text)]">Add the OEM part number.</span> Numbers like BN5A or
                GH82-31234A appear in catalogues and cross-reference tables that plain descriptions miss.
              </p>
              <p>
                <span className="text-[var(--ps-text)]">Say what you are checking.</span> “Does an A15 5G screen fit an
                A15 4G?” produces a different (and more careful) evidence search than “A15 screen”.
              </p>
              <p>
                <span className="text-[var(--ps-text)]">Use the Identify page</span> when the part is in your hand and
                the label is readable.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Confidence at a glance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-[var(--ps-muted)]">
              <p>🟢 <span className="text-[var(--ps-text)]">CONFIRMED / HIGH</span> — multiple independent, specific sources agree; part number cited.</p>
              <p>🟡 <span className="text-[var(--ps-text)]">LIKELY</span> — the evidence points one way but is thinner or only partially specific.</p>
              <p>🟠 <span className="text-[var(--ps-text)]">POSSIBLE</span> — relevant evidence exists but conflicts or covers siblings only.</p>
              <p>⚪ <span className="text-[var(--ps-text)]">UNKNOWN</span> — not enough reliable evidence. Try again with an exact model or part number.</p>
              <p>🔴 <span className="text-[var(--ps-text)]">NOT COMPATIBLE</span> — sources state or imply the part does not fit.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Errors you may see</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-[var(--ps-muted)]">
              <p><code>provider_not_configured</code> — no search provider key on this deployment.</p>
              <p><code>rate_limited</code> — per-IP limits reached; wait or raise the limit.</p>
              <p><code>timeout</code> — the run exceeded RESEARCH_TIMEOUT_MS.</p>
              <p><code>no_sources</code> — the provider returned nothing for any generated query.</p>
              <p><code>no_evidence</code> — pages were fetched but contained no usable claim.</p>
              <p><code>invalid_input</code> — the question was too short or missing a device/part.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
