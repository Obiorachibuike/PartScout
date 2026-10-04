import type {
  CompatibleModelFinding,
  CompatiblePartFinding,
  CompatibilityCheck,
  ConflictRecord,
  NormalizedClaim,
  PartCategory,
  VariantRisk,
  Verdict,
} from "@/types/research";
import { getPartCategory } from "@/lib/domain/parts";
import { normalizeIdentifier } from "@/lib/domain/devices";
import type { AIProvider } from "@/lib/providers/ai/AIProvider";
import type { QueryUnderstanding } from "@/lib/research/query-understanding";
import { collapseWhitespace, pluralize } from "@/lib/text";

/**
 * Stage 10 — final answer.
 *
 * The deterministic writer runs first and is always available: it narrates the
 * verdict, the number of independent sources, the models found and what remains
 * unverified. When an AI provider is configured it rewrites this into fluent
 * prose, but its output is validated — any model number that did not appear in
 * the evidence, or any verdict change, rejects the generated text and the
 * deterministic answer is used instead.
 */

export interface AnswerInput {
  understanding: QueryUnderstanding;
  verdict: Verdict;
  confidenceScore: number;
  confidenceLevel: string;
  confidenceSummary: string;
  supporting: NormalizedClaim[];
  opposing: NormalizedClaim[];
  compatibleModels: CompatibleModelFinding[];
  incompatibleModels: CompatibleModelFinding[];
  compatibleParts: CompatiblePartFinding[];
  checks: CompatibilityCheck[];
  conflicts: ConflictRecord[];
  variantRisks: VariantRisk[];
  sourcesCount: number;
  answerMethod?: "deterministic" | "ai_synthesis";
}

export interface GeneratedAnswer {
  headline: string;
  answer: string;
  summaryBullets: string[];
  verifyBeforeInstall: string[];
  answerMethod: "deterministic" | "ai_synthesis";
}

const VERDICT_HEADLINES: Record<Verdict, string> = {
  compatible: "Compatible — evidence supports this part",
  likely_compatible: "Likely compatible",
  uncertain: "Compatibility uncertain",
  not_compatible: "Not compatible",
  insufficient_evidence: "Not enough evidence",
  research_failed: "Research could not be completed",
  not_configured: "Web research is not configured",
};

export function buildDeterministicAnswer(input: AnswerInput): GeneratedAnswer {
  const definition = getPartCategory(input.understanding.partCategory);
  const device = input.understanding.device ?? describeTargetFromModels(input.understanding);
  const partLabel = input.understanding.part ?? definition.label.toLowerCase();
  const domains = new Set(input.supporting.map((claim) => claim.sourceDomain));

  const summaryBullets: string[] = [];

  if (input.verdict === "insufficient_evidence") {
    summaryBullets.push(
      `PartScout reviewed ${pluralize(input.sourcesCount, "source")} but found no statement that confirms or denies fitting this ${partLabel} to the ${device}.`,
    );
  } else if (input.supporting.length > 0) {
    summaryBullets.push(
      `${pluralize(domains.size, "independent source")} describe this ${partLabel} as compatible with the ${device}.`,
    );
    if (input.compatibleParts.some((part) => part.partNumber)) {
      const numbers = input.compatibleParts
        .map((part) => part.partNumber)
        .filter((value): value is string => Boolean(value))
        .slice(0, 4);
      summaryBullets.push(`Part number(s) referenced in evidence: ${numbers.join(", ")}.`);
    }
    const models = [...new Set(input.compatibleModels.flatMap((finding) => finding.modelNumbers))].slice(0, 6);
    if (models.length > 0) summaryBullets.push(`Model numbers named in evidence: ${models.join(", ")}.`);
  }

  for (const check of input.checks.filter((entry) => entry.status === "supported").slice(0, 2)) {
    summaryBullets.push(`${check.label}: ${check.detail}`);
  }
  if (input.conflicts.length > 0) {
    summaryBullets.push(
      `${pluralize(input.conflicts.length, "conflict group")} found: sources disagree, so PartScout is not asserting a firm result.`,
    );
  }
  if (input.variantRisks.length > 0) {
    summaryBullets.push(input.variantRisks[0]!.message);
  }
  if (input.verdict === "not_compatible") {
    summaryBullets.push("Evidence explicitly states this part does not fit — do not install it without further checks.");
  }

  const answer = composeParagraph(input, device, partLabel, domains.size);
  const verify = buildVerifyList(input, definition.id);

  return {
    headline: VERDICT_HEADLINES[input.verdict],
    answer,
    summaryBullets: summaryBullets.slice(0, 6),
    verifyBeforeInstall: verify,
    answerMethod: "deterministic",
  };
}

function composeParagraph(input: AnswerInput, device: string, partLabel: string, domainCount: number): string {
  const definition = getPartCategory(input.understanding.partCategory);
  const sourcesPhrase =
    input.sourcesCount === 0
      ? "no usable public sources"
      : `${pluralize(input.sourcesCount, "public source")} (${pluralize(domainCount, "independent publisher")} supporting)`;

  switch (input.verdict) {
    case "compatible":
      return `PartScout searched the live web and found ${sourcesPhrase} that state this ${partLabel} fits the ${device}. The evidence is consistent across publishers and names the relevant model numbers, which gives ${input.confidenceScore}% evidence confidence. ${input.confidenceSummary} Compatibility can still differ between board revisions, so verify the checks below before fitting the part.`;
    case "likely_compatible":
      return `Evidence from ${sourcesPhrase} supports fitting this ${partLabel} to the ${device}, but the confirmation is not unanimous or not fully specific. Evidence confidence is ${input.confidenceScore}%. Treat the result as probable rather than certain and verify the model number and connector configuration before ordering.`;
    case "uncertain":
      return `PartScout found ${sourcesPhrase} with mixed, partial or conflicting information about this ${partLabel} and the ${device}. Evidence confidence is ${input.confidenceScore}%. ${input.confidenceSummary} Where sources conflict they are listed in full below so you can judge the specific variant you are working on.`;
    case "not_compatible":
      return `PartScout found ${sourcesPhrase} that explicitly state this ${partLabel} does not fit the ${device}. Evidence confidence in that finding is ${input.confidenceScore}%. Do not install the part without independently confirming the correct assembly.`;
    case "insufficient_evidence":
      return `PartScout could not find enough reliable evidence to confirm compatibility. It searched the live web and reviewed ${sourcesPhrase}, but no retrieved page makes a clear statement about this ${definition.label.toLowerCase()} and ${input.understanding.device ?? "this device"}. ${input.confidenceSummary}`;
    case "not_configured":
      return "Live web research is not configured on this deployment, so no compatibility research could be performed.";
    default:
      return `The research run did not complete, so no compatibility conclusion was produced. ${input.confidenceSummary}`;
  }
}

function buildVerifyList(input: AnswerInput, category: PartCategory): string[] {
  const verify: string[] = [];

  for (const check of input.checks.filter((entry) => entry.status === "unknown" || entry.status === "conflicting").slice(0, 3)) {
    verify.push(`Confirm ${check.label.toLowerCase()} — ${check.detail}`);
  }
  for (const risk of input.variantRisks.slice(0, 1)) {
    verify.push(risk.message);
  }

  const categoryAdvice: Record<PartCategory, string[]> = {
    screen: [
      "Compare the flex connector pin count and position against the old assembly before fitting.",
      "Check whether the assembly includes the frame; frame-less panels require transferring the old frame.",
      "Confirm the panel type (OLED/LCD) matches, as mixed technologies are not interchangeable.",
    ],
    battery: [
      "Compare voltage, capacity and connector type with the old battery before installation.",
      "Check the cell dimensions — a thicker cell can be punctured when the back cover is refitted.",
    ],
    charging_flex: [
      "Check the board revision (V1/V2) and microphone placement against the old flex.",
      "Confirm the connector type (USB-C / micro-USB) and flex routing match the chassis.",
    ],
    charging_board: [
      "Compare the board revision and mounting points with the original board.",
      "Verify the daughter-board connector count and position.",
    ],
    power_flex: [
      "Confirm whether the flex carries both power and volume keys.",
      "Check the button spacing against the chassis before fitting.",
    ],
    volume_flex: ["Confirm key count and spacing against the chassis.", "Check the connector orientation."],
    back_cover: [
      "Check the camera cutout layout and button openings against the old cover.",
      "Confirm the variant (colour, 4G/5G) matches the device.",
    ],
    back_glass: ["Confirm camera cutout layout and adhesive type.", "Check the variant and finish."],
    housing: ["Compare camera cutout and button positions.", "Verify whether the housing includes the frame and small parts."],
    camera: [
      "Compare the module stack height and connector against the original.",
      "Check for calibration requirements after replacement.",
    ],
    speaker: ["Compare impedance and connector position.", "Check the acoustic chamber fit."],
    microphone: ["Check the mounting position and contact type.", "Verify the connector layout."],
    fingerprint: ["Check for pairing/calibration requirements specific to this device.", "Verify the connector and mounting."],
    buttons: ["Compare button material and travel with the original.", "Check the gasket/adhesive configuration."],
    sensors: ["Check for calibration or pairing requirements.", "Verify the connector and mounting."],
    antenna: ["Compare the contact points and routing.", "Check connector placement."],
    nfc: ["Confirm the coil placement and connector.", "Check whether the variant supports NFC."],
    wireless_charging: ["Confirm coil placement and connector.", "Check whether the variant supports wireless charging."],
    other: ["Compare the connector and mounting configuration with the original part."],
  };

  verify.push(...(categoryAdvice[category] ?? categoryAdvice.other));
  verify.push("Confirm the exact model number (including 4G/5G or regional SKU) printed on the device.");

  return dedupe(verify).slice(0, 5);
}

function describeTargetFromModels(understanding: QueryUnderstanding): string {
  if (understanding.modelNumbers.length > 0) return understanding.modelNumbers[0]!;
  return understanding.rawQuery;
}

/**
 * Optional AI rewrite. Rejected unless it stays inside the evidence envelope.
 */
export async function generateFinalAnswer(
  input: AnswerInput,
  options: { ai?: AIProvider | null; logger?: { warn: (message: string, meta?: unknown) => void } } = {},
): Promise<GeneratedAnswer> {
  const deterministic = buildDeterministicAnswer(input);
  if (!options.ai || input.verdict === "not_configured" || input.verdict === "research_failed") return deterministic;

  const allowedModels = new Set(
    [
      ...input.understanding.modelNumbers,
      ...input.compatibleModels.flatMap((finding) => finding.modelNumbers),
      ...input.incompatibleModels.flatMap((finding) => finding.modelNumbers),
      ...input.supporting.flatMap((claim) => claim.modelNumbers),
      ...input.opposing.flatMap((claim) => claim.modelNumbers),
    ].map((value) => normalizeIdentifier(value)),
  );

  try {
    const result = await options.ai.generateAnswer({
      device: input.understanding.device,
      partCategory: input.understanding.partCategory,
      partNumber: input.understanding.partNumber,
      verdict: input.verdict,
      confidenceScore: input.confidenceScore,
      confidenceLevel: input.confidenceLevel,
      supportedModels: input.compatibleModels.slice(0, 6).map((finding) => finding.device),
      conflictingModels: input.incompatibleModels.slice(0, 6).map((finding) => finding.device),
      checksSummary: input.checks
        .map((check) => `- ${check.label}: ${check.status} (${check.detail.slice(0, 140)})`)
        .join("\n"),
      conflictsSummary:
        input.conflicts.length === 0
          ? "(none)"
          : input.conflicts
              .map((conflict) => `- ${conflict.topic}: ${conflict.explanation}`)
              .join("\n"),
      evidenceSummary: evidenceSummaryFor(input),
      allowedRefs: buildAllowedRefs(input),
    });

    const answer = collapseWhitespace(result.answer ?? "");
    if (answer.length < 40) return deterministic;

    const suspiciousModels = findModelLikeTokens(answer).filter((token) => !allowedModels.has(normalizeIdentifier(token)));
    if (suspiciousModels.length > 0) {
      options.logger?.warn("AI answer introduced model numbers not present in evidence; using deterministic answer", {
        tokens: suspiciousModels.slice(0, 5),
      });
      return deterministic;
    }
    if (/no evidence|not enough|insufficient/i.test(answer) && input.verdict === "compatible") {
      // Guard against the opposite failure mode too.
      return deterministic;
    }

    return {
      headline: deterministic.headline,
      answer,
      summaryBullets: (result.summaryBullets && result.summaryBullets.length > 0
        ? result.summaryBullets.map((bullet) => collapseWhitespace(bullet)).filter((bullet) => bullet.length > 12)
        : deterministic.summaryBullets
      ).slice(0, 6),
      verifyBeforeInstall:
        result.verifyBeforeInstall && result.verifyBeforeInstall.length > 0
          ? result.verifyBeforeInstall.map((item) => collapseWhitespace(item)).filter((item) => item.length > 8).slice(0, 5)
          : deterministic.verifyBeforeInstall,
      answerMethod: "ai_synthesis",
    };
  } catch (error) {
    options.logger?.warn("AI answer synthesis failed; using deterministic answer", {
      error: error instanceof Error ? error.message : String(error),
    });
    return deterministic;
  }
}

/** Deterministic [S#] reference map shared by the evidence summary and prompts. */
export function buildRefMap(claims: NormalizedClaim[]): Map<string, string> {
  const refs = new Map<string, string>();
  for (const claim of claims) {
    if (!refs.has(claim.sourceId)) refs.set(claim.sourceId, `S${refs.size + 1}`);
  }
  return refs;
}

export function evidenceSummaryFor(input: AnswerInput): string {
  const claims = [...input.supporting, ...input.opposing];
  const refs = buildRefMap(claims);
  return claims
    .slice(0, 14)
    .map((claim) => {
      const ref = refs.get(claim.sourceId) ?? "S?";
      const models = claim.modelNumbers.length ? ` models=[${claim.modelNumbers.join(", ")}]` : "";
      const partNumber = claim.partNumber ? ` partNumber=${claim.partNumber}` : "";
      return `[${ref}] ${claim.claim.toUpperCase()} — device="${claim.deviceCanonical ?? "unspecified"}"${models}${partNumber} — "${claim.evidenceText.slice(0, 160)}" (${claim.sourceDomain})`;
    })
    .join("\n");
}

export function buildAllowedRefs(input: AnswerInput): string[] {
  return [...buildRefMap([...input.supporting, ...input.opposing]).values()];
}

const MODEL_LIKE = /\b(sm-[a-z]\d{2,4}[a-z0-9]*|gt-[a-z0-9]{4,10}|rmx\d{4,6}|cph\d{3,5}|xt\d{4,5}|ta-\d{3,4}|a\d{4}|iphone\s?\d{1,2}[a-z ]{0,8})\b/gi;

export function findModelLikeTokens(text: string): string[] {
  return [...new Set((text.match(MODEL_LIKE) ?? []).map((token) => token.trim()))];
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
