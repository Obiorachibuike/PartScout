/**
 * End-to-end research verification.
 *
 * Usage:
 *   npm run test:research                       # uses fixtures (no API credits)
 *   SEARCH_PROVIDER=tavily npm run test:research -- "Samsung A15 charging flex"
 *
 * With fixtures this exercises the full pipeline (query generation → search →
 * extraction → evidence → compatibility → confidence → answer) against synthetic
 * pages. With a real provider configured it performs live research and prints the
 * report, which is the flow described in the README's testing section.
 */

import { getCapabilities, fixturesAllowed, isSearchProviderReady } from "../src/lib/config";
import { researchPartCompatibility } from "../src/lib/research/research-pipeline";
import { clearMemoryCache } from "../src/lib/research/cache";

const DEFAULT_QUESTIONS = [
  "ps-fixture:compatible Can I use a Samsung Galaxy A15 4G charging flex on another A15?",
  "ps-fixture:conflict Will an A15 5G screen work on an A15 4G?",
  "ps-fixture:injection BN5A battery compatibility",
  "ps-fixture:none Unknown phone part 123456 compatibility",
];

async function main() {
  const capabilities = getCapabilities();
  const explicit = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  const questions = explicit.length > 0 ? explicit : fixturesAllowed ? DEFAULT_QUESTIONS : ["What screens work with Samsung Galaxy A15 4G?"];

  console.log("PartScout research verification\n" + "=".repeat(60));
  console.log("capabilities:", {
    searchProvider: capabilities.searchProvider,
    searchConfigured: capabilities.searchConfigured,
    aiProvider: capabilities.aiProvider,
    aiConfigured: capabilities.aiConfigured,
    fixtures: capabilities.fixturesEnabled,
    database: capabilities.databaseConfigured,
  });
  if (capabilities.setupIssues.length) console.log("setup issues:", capabilities.setupIssues);

  if (!isSearchProviderReady()) {
    console.error("\nNo usable search provider. Set SEARCH_PROVIDER + key, or PARTSCOUT_ALLOW_FIXTURES=true to use fixtures.");
    process.exit(1);
  }

  for (const question of questions) {
    clearMemoryCache();
    console.log("\n" + "-".repeat(60));
    console.log("QUESTION:", question);
    const started = Date.now();
    const report = await researchPartCompatibility({
      question,
      persist: false,
      forceRefresh: true,
      onStage: (event) => {
        if (event.status === "done" || event.status === "error") {
          console.log(`  [${event.status}] ${event.label}${event.detail ? ` — ${event.detail}` : ""}`);
        }
      },
    });
    const elapsed = Date.now() - started;

    console.log(`\n  verdict: ${report.verdict}`);
    console.log(`  confidence: ${report.confidence.score}% (${report.confidence.level})`);
    console.log("  confidence breakdown:", report.confidence.breakdown);
    console.log(`  headline: ${report.headline}`);
    console.log(`  intent: ${report.intent} | device: ${report.plan.device ?? "-"} | part: ${report.plan.part ?? "-"}`);
    console.log(`  queries (${report.plan.queries.length}):`);
    for (const query of report.plan.queries) console.log(`    · ${query.query}  [${query.kind}]`);
    console.log(`  sources: ${report.sources.length} (tiers: ${[...new Set(report.sources.map((s) => s.quality.tier))].join(", ")})`);
    console.log(`  claims: ${report.claims.length}`);
    if (report.compatibleModels.length) {
      console.log("  compatible models:");
      for (const model of report.compatibleModels.slice(0, 5)) {
        console.log(`    · ${model.device} [${model.modelNumbers.join(", ")}] via ${model.independentSources} source(s)`);
      }
    }
    if (report.conflicts.length) console.log(`  conflicts: ${report.conflicts.length}`);
    if (report.warnings.length) {
      console.log("  warnings:");
      for (const warning of report.warnings.slice(0, 4)) console.log(`    ! ${warning}`);
    }
    if (report.failure) console.log(`  failure: ${report.failure.code} — ${report.failure.message}`);
    console.log(`  usage: ${report.usage.searchCalls} searches, ${report.usage.pagesFetched} fetches, ${report.usage.aiCalls} AI calls, $${report.usage.estimatedCostUsd.toFixed(4)}`);
    console.log(`  elapsed: ${elapsed}ms (report ${report.usage.durationMs}ms)`);

    // Invariants that must hold for every report.
    if (report.verdict !== "insufficient_evidence" && report.verdict !== "research_failed" && report.verdict !== "not_configured") {
      if (report.claims.length === 0) throw new Error("INVARIANT VIOLATED: verdict without claims");
      if (report.sources.length === 0) throw new Error("INVARIANT VIOLATED: verdict without sources");
      for (const claim of report.claims) {
        if (!report.sources.some((source) => source.canonicalUrl === claim.sourceUrl)) {
          throw new Error(`INVARIANT VIOLATED: claim cites a source that is not in the report (${claim.sourceUrl})`);
        }
      }
    }
  }

  console.log("\nAll invariants held.");
}

main().catch((error) => {
  console.error("verification failed:", error);
  process.exit(1);
});
