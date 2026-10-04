import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { researchPartCompatibility } from "@/lib/research/research-pipeline";
import { identifyPartFromImage, buildOverrideQuestion } from "@/lib/research/identify";
import { FixtureSearchProvider } from "@/lib/providers/search/FixtureSearchProvider";
import type { SearchProvider } from "@/lib/providers/search/SearchProvider";
import { clearMemoryCache } from "@/lib/research/cache";
import { UsageTracker } from "@/lib/research/usage";
import type { ResearchReport } from "@/types/research";
import { disableDatabase, useMemoryDb, type MemoryDb } from "./helpers/memory-db";
import { StubAIProvider } from "./helpers/ai-stub";

/**
 * Research-flow test-suite.
 *
 * Every test runs the *real* pipeline end to end (understanding → queries →
 * search → extraction → evaluation → evidence → normalisation → compatibility →
 * confidence → answer) against the development fixture provider. The fixtures are
 * synthetic pages, never live web data, and each report is asserted to be labelled
 * as such.
 */

const scenario = (
  name: "compatible" | "conflict" | "injection" | "battery" | "power_flex" | "none",
): SearchProvider[] => [
  new FixtureSearchProvider({ scenario: name }),
];

/** Shared invariant: an answer with a compatibility verdict must be evidence-backed. */
function assertEvidenceInvariants(report: ResearchReport): void {
  const sourceUrls = new Set(report.sources.map((source) => source.canonicalUrl));
  for (const claim of report.claims) {
    expect(sourceUrls.has(claim.sourceUrl), `claim ${claim.id} cites a source that is not in the report`).toBe(true);
  }

  const evidenceVerdicts = ["compatible", "likely_compatible", "uncertain", "not_compatible"];
  if (evidenceVerdicts.includes(report.verdict)) {
    expect(report.claims.length, "a compatibility verdict requires at least one claim").toBeGreaterThan(0);
    expect(report.sources.length, "a compatibility verdict requires at least one source").toBeGreaterThan(0);
  }

  // Nothing in a report may claim laboratory certainty.
  expect(report.confidence.disclaimer.toLowerCase()).toMatch(/not a (laboratory|guarantee)|evidence, not/);
}

let db: MemoryDb;

beforeEach(() => {
  clearMemoryCache();
  // useMemoryDb() installs the client *and* returns the same store, so assertions
  // can inspect what the pipeline persisted.
  db = useMemoryDb();
});

afterAll(() => {
  disableDatabase();
});

describe("phone → part research flows", () => {
  it("1. finds charging-flex evidence for a phone and cites every source", async () => {
    const report = await researchPartCompatibility({
      question: "Does a charging flex for a Samsung Galaxy A15 4G fit SM-A155F?",
      providersOverride: scenario("compatible"),
      persist: true,
    });

    expect(report.verdict).toBe("compatible");
    expect(report.confidence.level).toBe("HIGH_CONFIDENCE");
    expect(report.confidence.score).toBeGreaterThanOrEqual(72);
    expect(report.claims.length).toBeGreaterThanOrEqual(6);
    expect(report.sources.length).toBeGreaterThanOrEqual(3);
    expect(report.fixtureData).toBe(true);
    assertEvidenceInvariants(report);
  });

  it("2. resolves battery compatibility and keeps 4G/5G variants apart", async () => {
    const report = await researchPartCompatibility({
      question: "battery compatible with Samsung Galaxy A15 4G SM-A155F",
      providersOverride: scenario("battery"),
    });

    expect(["compatible", "likely_compatible"]).toContain(report.verdict);
    expect(report.claims.some((claim) => claim.partNumber === "EB-BA155ABY" || claim.evidenceText.includes("EB-BA155ABY"))).toBe(true);
    const compatibleDevices = report.compatibleModels.map((model) => model.device.toLowerCase());
    expect(compatibleDevices.some((device) => device.includes("a15"))).toBe(true);
    // The evidence explicitly rules out the 5G sibling, so it must never be listed as compatible.
    expect(report.compatibleModels.some((model) => model.modelNumbers.includes("SM-A156B"))).toBe(false);
    assertEvidenceInvariants(report);
  });

  it("3. returns the OEM part number when a source prints it", async () => {
    const report = await researchPartCompatibility({
      question: "Galaxy A15 4G charging flex OEM part number GH96-16043A",
      providersOverride: scenario("compatible"),
    });

    const blob = JSON.stringify(report.claims) + JSON.stringify(report.sources);
    expect(blob).toContain("GH96-16043A");
    expect(report.claims.some((claim) => claim.partNumber === "GH96-16043A")).toBe(true);
    assertEvidenceInvariants(report);
  });

  it("4. answers power-flex questions from the same evidence trail", async () => {
    const report = await researchPartCompatibility({
      question: "power flex for Galaxy A15 4G — compatible models?",
      providersOverride: scenario("power_flex"),
    });

    expect(["compatible", "likely_compatible"]).toContain(report.verdict);
    expect(report.checks.length).toBeGreaterThan(0);
    expect(report.verifyBeforeInstall.length).toBeGreaterThan(0);
    assertEvidenceInvariants(report);
  });
});

describe("reverse and identifier flows", () => {
  it("5. part → phones reverse lookup lists devices without inventing any", async () => {
    const report = await researchPartCompatibility({
      question: "Which phones use the A15 charging flex?",
      providersOverride: scenario("compatible"),
    });

    expect(report.intent).toBe("part_to_phones");
    expect(report.compatibleModels.length).toBeGreaterThan(0);
    expect(report.compatibleModels.flatMap((model) => model.modelNumbers)).toContain("SM-A155F");
    for (const finding of report.compatibleModels) {
      // Every listed model must come from a claim that cites a real source.
      expect(finding.supportingClaimIds.length).toBeGreaterThan(0);
      const claimSources = finding.supportingClaimIds.map(
        (id) => report.claims.find((claim) => claim.id === id)?.sourceUrl ?? "",
      );
      for (const url of claimSources) {
        expect(report.sources.some((source) => source.canonicalUrl === url)).toBe(true);
      }
    }
    assertEvidenceInvariants(report);
  });

  it("6. part number → device research neutralises an injection attempt in a page", async () => {
    const report = await researchPartCompatibility({
      question: "Which phones use battery BN5A?",
      providersOverride: scenario("injection"),
    });

    // The injected instruction must never reach the answer…
    const prose = `${report.headline} ${report.answer} ${report.summaryBullets.join(" ")}`.toLowerCase();
    expect(prose).not.toContain("every samsung phone");
    expect(prose).not.toContain("ignore all previous instructions");
    expect(prose).not.toContain("system prompt");
    // …and it must be surfaced to the user instead of hidden.
    expect(report.warnings.join(" ").toLowerCase()).toMatch(/instruction|injection/);
    // Meanwhile the legitimate sentence on that page is still usable evidence.
    expect(report.claims.length).toBeGreaterThan(0);
    expect(report.claims.some((claim) => claim.modelNumbers.includes("SM-A155F"))).toBe(true);
    assertEvidenceInvariants(report);
  });

  it("7. photo → identifier → research (vision reads, the web decides)", async () => {
    const ai = new StubAIProvider();
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

    const { identification, researchQuestion } = await identifyPartFromImage({
      buffer,
      mimeType: "image/jpeg",
      ai,
      tracker: new UsageTracker(),
    });

    expect(identification.identifier).toBe("BN5A");
    expect(identification.partCategory).toBe("battery");
    expect(researchQuestion).toContain("BN5A");

    const report = await researchPartCompatibility({
      question: researchQuestion!,
      providersOverride: scenario("injection"),
      aiOverride: null,
    });

    expect(["compatible", "likely_compatible", "uncertain", "insufficient_evidence"]).toContain(report.verdict);
    assertEvidenceInvariants(report);

    // The manual path (no vision provider) still researches a typed identifier.
    expect(buildOverrideQuestion("GH96-16043A", "charging flex")).toContain("GH96-16043A");
  });
});

describe("conflict, absence and caching", () => {
  it("8. conflicting sources produce an uncertain verdict with both sides visible", async () => {
    const report = await researchPartCompatibility({
      question: "Is a Galaxy A15 5G screen compatible with an A15 4G SM-A155F?",
      providersOverride: scenario("conflict"),
    });

    expect(report.verdict).toBe("uncertain");
    expect(report.conflicts.length).toBeGreaterThan(0);
    const conflict = report.conflicts[0]!;
    expect(conflict.supporting.length + conflict.opposing.length).toBeGreaterThan(1);
    expect(["POSSIBLE", "UNKNOWN", "LIKELY"]).toContain(report.confidence.level);
    expect(report.confidence.score).toBeLessThanOrEqual(58);
    expect(report.checks.some((check) => check.status === "conflicting" || check.status === "contradicted")).toBe(true);
    assertEvidenceInvariants(report);
  });

  it("9. no sources → insufficient evidence, never a guessed answer", async () => {
    const report = await researchPartCompatibility({
      question: "Unknown phone part 123456 compatibility",
      providersOverride: scenario("none"),
    });

    expect(report.verdict).toBe("insufficient_evidence");
    expect(report.confidence.score).toBe(0);
    expect(report.confidence.level).toBe("UNKNOWN");
    expect(report.claims).toHaveLength(0);
    expect(report.sources).toHaveLength(0);
    expect(report.failure?.code).toBe("no_sources");
    expect(report.answer.toLowerCase()).toMatch(/could not (find enough reliable evidence|retrieve usable sources)/);
  });

  it("10. cached research is served from cache and labelled", async () => {
    const question = "Samsung Galaxy A15 4G charging flex compatibility";
    const providers = scenario("compatible");

    const first = await researchPartCompatibility({ question, providersOverride: providers });
    expect(first.cached).toBe(false);

    const second = await researchPartCompatibility({ question, providersOverride: scenario("none") });
    expect(second.cached).toBe(true);
    expect(second.id).toBe(first.id);
    expect(second.claims.length).toBe(first.claims.length);
    expect(second.sources.length).toBe(first.sources.length);

    // A forced refresh bypasses the cache (and clears it)…
    const refreshed = await researchPartCompatibility({
      question,
      providersOverride: providers,
      forceRefresh: true,
    });
    expect(refreshed.cached).toBe(false);
    expect(refreshed.verdict).toBe(first.verdict);
  });
});

describe("persistence and cross-cutting invariants", () => {
  it("persists sessions, sources, claims and usage when a database is available", async () => {
    const report = await researchPartCompatibility({
      question: "Galaxy A15 4G charging flex persistence check",
      providersOverride: scenario("compatible"),
      persist: true,
    });

    expect(report.id).toBe(db.tables.researchSession[0]!.id);
    expect(db.tables.researchSession.length).toBe(1);
    expect(db.tables.researchSource.length).toBeGreaterThan(0);
    expect(db.tables.researchClaim.length).toBeGreaterThan(0);
    expect(db.tables.search.length).toBe(1);
    expect(db.tables.usageRecord.length).toBeGreaterThan(0);
  });

  it("every report carries a machine-readable plan, warnings array and usage summary", async () => {
    const report = await researchPartCompatibility({
      question: "Galaxy A15 4G charging flex",
      providersOverride: scenario("compatible"),
    });

    expect(report.plan.queries.length).toBeGreaterThan(1);
    expect(Array.isArray(report.warnings)).toBe(true);
    expect(report.usage.searchCalls).toBeGreaterThan(0);
    expect(report.sources.length).toBeGreaterThan(0);
    expect(report.answerMethod).toMatch(/deterministic|ai_synthesis/);
  });

  it("degrades to a not-configured report when no search provider is usable", async () => {
    const report = await researchPartCompatibility({
      question: "Galaxy A15 4G charging flex",
      providersOverride: [],
    });

    expect(["not_configured", "research_failed"]).toContain(report.verdict);
    expect(report.claims).toHaveLength(0);
    expect(report.sources).toHaveLength(0);
  });
});
