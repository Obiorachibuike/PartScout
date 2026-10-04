import type {
  EvaluatedSource,
  ExtractedSource,
  ResearchPlan,
  SourceQuality,
  SourceTier,
} from "@/types/research";

/** The understanding stage's output; the pipeline passes it in directly. */
type QueryUnderstanding = Omit<ResearchPlan, "queries">;

/**
 * Source evaluation.
 *
 * Every retrieved page is scored on eight signals. The score is *evidence*
 * quality, never a truth judgement: a marketplace listing and a manufacturer
 * service page can both describe a part, but only one of them can be trusted to
 * carry an exact model number.
 *
 * Tiers (the same wording the UI renders via `tierLabel()`)
 *   1 — Manufacturer / official      (samsung.com, apple.com, …)
 *   2 — Repair database / supplier   (iFixit, parts suppliers, spec databases, manuals)
 *   3 — Marketplace / reseller       (eBay, Amazon, AliExpress, local resellers)
 *   4 — Forum / community            (Reddit, XDA, technician boards, social video)
 */

interface DomainProfile {
  tier: SourceTier;
  label: string;
}

/** Domains whose tier is known up front (everything else falls back to heuristics). */
const KNOWN_DOMAINS: Record<string, DomainProfile> = {
  // ---------------------------------------------------------------- tier 1
  "samsung.com": { tier: 1, label: "Manufacturer" },
  "apple.com": { tier: 1, label: "Manufacturer" },
  "selfservicerepair.com": { tier: 1, label: "Manufacturer self-repair program" },
  "google.com": { tier: 1, label: "Manufacturer" },
  "motorola.com": { tier: 1, label: "Manufacturer" },
  "mi.com": { tier: 1, label: "Manufacturer" },
  "xiaomi.com": { tier: 1, label: "Manufacturer" },
  "consumer.huawei.com": { tier: 1, label: "Manufacturer" },
  "huawei.com": { tier: 1, label: "Manufacturer" },
  "oppo.com": { tier: 1, label: "Manufacturer" },
  "vivo.com": { tier: 1, label: "Manufacturer" },
  "oneplus.com": { tier: 1, label: "Manufacturer" },
  "realme.com": { tier: 1, label: "Manufacturer" },
  "nokia.com": { tier: 1, label: "Manufacturer" },
  "sony.com": { tier: 1, label: "Manufacturer" },
  "lg.com": { tier: 1, label: "Manufacturer" },
  "nothing.tech": { tier: 1, label: "Manufacturer" },
  "asus.com": { tier: 1, label: "Manufacturer" },
  "lenevo.com": { tier: 1, label: "Manufacturer" },
  "lenovo.com": { tier: 1, label: "Manufacturer" },
  "fairphone.com": { tier: 1, label: "Manufacturer" },
  "tecno-mobile.com": { tier: 1, label: "Manufacturer" },
  "infinixmobility.com": { tier: 1, label: "Manufacturer" },
  "itel-mobile.com": { tier: 1, label: "Manufacturer" },
  "honor.com": { tier: 1, label: "Manufacturer" },
  "htc.com": { tier: 1, label: "Manufacturer" },
  "blackberry.com": { tier: 1, label: "Manufacturer" },
  "micromaxinfo.com": { tier: 1, label: "Manufacturer" },
  "lava.in": { tier: 1, label: "Manufacturer" },

  // ---------------------------------------------------------------- tier 2
  "ifixit.com": { tier: 2, label: "Repair guide database" },
  "samsungparts.com": { tier: 2, label: "OEM parts supplier" },
  "parts4gsm.com": { tier: 2, label: "Parts supplier / technical resource" },
  "mobilesentrix.com": { tier: 2, label: "Parts supplier" },
  "injuredgadgets.com": { tier: 2, label: "Repair specialist" },
  "gsmarena.com": { tier: 2, label: "Device specification database" },
  "phonearena.com": { tier: 2, label: "Device specification database" },
  "kimovil.com": { tier: 2, label: "Device specification database" },
  "devicespecifications.com": { tier: 2, label: "Device specification database" },
  "gsmchoice.com": { tier: 2, label: "Device specification database" },
  "manualslib.com": { tier: 2, label: "Manuals / documentation" },
  "manualzz.com": { tier: 2, label: "Manuals / documentation" },
  "scribd.com": { tier: 4, label: "Document sharing (user uploads)" },

  // ---------------------------------------------------------------- tier 3
  "reddit.com": { tier: 4, label: "Repair community" },
  "xda-developers.com": { tier: 4, label: "Repair / development community" },
  "xdaforums.com": { tier: 4, label: "Repair / development community" },
  "gsmhosting.com": { tier: 4, label: "Technician forum" },
  "gsm-forum.com": { tier: 4, label: "Technician forum" },
  "repair.wiki": { tier: 4, label: "Repair wiki" },

  // ---------------------------------------------------------------- tier 4
  "ebay.com": { tier: 3, label: "Marketplace listing" },
  "amazon.com": { tier: 3, label: "Marketplace listing" },
  "aliexpress.com": { tier: 3, label: "Marketplace listing" },
  "alibaba.com": { tier: 3, label: "Marketplace listing" },
  "walmart.com": { tier: 3, label: "Marketplace listing" },
  "temu.com": { tier: 3, label: "Marketplace listing" },
  "wish.com": { tier: 3, label: "Marketplace listing" },
  "etsy.com": { tier: 3, label: "Marketplace listing" },
  "flipkart.com": { tier: 3, label: "Marketplace listing" },
  "lazada.com": { tier: 3, label: "Marketplace listing" },
  "shopee.com": { tier: 3, label: "Marketplace listing" },
  "daraz.pk": { tier: 3, label: "Marketplace listing" },
  "jumia.com.ng": { tier: 3, label: "Marketplace listing" },
  "konga.com": { tier: 3, label: "Marketplace listing" },
  "quora.com": { tier: 4, label: "User-generated answers" },
  "youtube.com": { tier: 4, label: "Video (user-generated)" },
  "facebook.com": { tier: 4, label: "Social media" },
  "pinterest.com": { tier: 4, label: "Social media" },
  "tiktok.com": { tier: 4, label: "Social media" },
};

const TIER_LABELS: Record<SourceTier, string> = {
  1: "Manufacturer / official",
  2: "Repair database / professional supplier",
  3: "Marketplace / reseller",
  4: "Forum / community",
};

const TIER_AUTHORITY: Record<SourceTier, number> = { 1: 1, 2: 0.8, 3: 0.5, 4: 0.35 };

const WEIGHTS = {
  authority: 0.2,
  relevance: 0.18,
  directness: 0.18,
  modelSpecificity: 0.12,
  partSpecificity: 0.12,
  independence: 0.1,
  recency: 0.05,
  explicitClaim: 0.05,
} as const;

/* -------------------------------------------------------------------------- */
/* Domain profiling                                                           */
/* -------------------------------------------------------------------------- */

export function profileDomain(domain: string): { tier: SourceTier; label: string } {
  const clean = domain.toLowerCase().replace(/^www\./, "");

  for (const [known, profile] of Object.entries(KNOWN_DOMAINS)) {
    if (clean === known || clean.endsWith(`.${known}`)) return profile;
  }

  // Fixture domains used in development/testing.
  if (clean.includes("fixtures.partscout.local")) {
    if (clean.startsWith("manufacturer")) return { tier: 1, label: "Fixture manufacturer page" };
    if (clean.startsWith("repair-db")) return { tier: 2, label: "Fixture repair database" };
    if (clean.startsWith("supplier")) return { tier: 2, label: "Fixture supplier page" };
    if (clean.startsWith("forum")) return { tier: 4, label: "Fixture technician forum" };
    return { tier: 4, label: "Fixture page" };
  }

  if (/(^|\.)(support|docs|manuals?)\./.test(clean)) return { tier: 2, label: "Documentation" };
  if (/forum|community|reddit|board/.test(clean)) return { tier: 4, label: TIER_LABELS[4] };
  if (/marketplace|shop|store|buy|deal/.test(clean)) return { tier: 3, label: TIER_LABELS[3] };
  if (/parts|repair|gsm|fix|mobile/.test(clean)) return { tier: 2, label: TIER_LABELS[2] };

  return { tier: 4, label: TIER_LABELS[4] };
}

/* -------------------------------------------------------------------------- */
/* Text signals                                                              */
/* -------------------------------------------------------------------------- */

const EXPLICIT_SUPPORT = [
  /\bcompatible with\b/,
  /\b(?:is|are)\s+compatible\b/,
  /\bfits\s+(?:the\s+)?[a-z0-9]/,
  /\bwill fit\b/,
  /\bfit(s)? for\b/,
  /\breplacement for\b/,
  /\bsuitable for\b/,
  /\bworks? with\b/,
  /\binterchangeable with\b/,
  /\bused (?:in|with)\b/,
  /\bdesigned for\b/,
  /\boem (?:part )?for\b/,
];

const EXPLICIT_OPPOSE = [
  /\bnot compatible\b/,
  /\bincompatible\b/,
  /\b(?:does not|doesn't|will not|won't) fit\b/,
  /\bnot interchangeable\b/,
  /\bdifferent (?:connector|flex|layout)\b/,
  /\bnot for\b/,
];

export function hasExplicitSupport(text: string): boolean {
  return EXPLICIT_SUPPORT.some((pattern) => pattern.test(text));
}

export function hasExplicitOpposition(text: string): boolean {
  return EXPLICIT_OPPOSE.some((pattern) => pattern.test(text));
}

function tokens(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9+]+/g)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "does", "will", "phone",
  "phones", "part", "parts", "which", "what", "compatible", "compatibility",
  "replacement", "genuine", "original", "price", "buy", "sale", "new", "used",
]);

/** Key terms that must appear on a page for it to be relevant at all. */
export function keyTerms(understanding: QueryUnderstanding): string[] {
  const terms = new Set<string>();
  for (const token of tokens(understanding.device ?? "")) terms.add(token);
  for (const token of tokens(understanding.part ?? "")) terms.add(token);
  for (const model of understanding.modelNumbers) terms.add(model.toLowerCase());
  if (understanding.partNumber) terms.add(understanding.partNumber.toLowerCase());
  return [...terms];
}

function relevanceScore(
  source: ExtractedSource,
  terms: string[],
  understanding: QueryUnderstanding,
): { score: number; matched: string[] } {
  if (terms.length === 0) return { score: 0.4, matched: [] };
  const haystack = `${source.title}\n${source.snippet}\n${source.text.slice(0, 4_000)}`.toLowerCase();
  const matched = terms.filter((term) => haystack.includes(term));
  let score = Math.min(1, matched.length / Math.max(2, Math.ceil(terms.length * 0.7)));
  if (understanding.modelNumbers.some((model) => haystack.includes(model.toLowerCase()))) {
    score = Math.min(1, score + 0.2);
  }
  if (understanding.partNumber && haystack.includes(understanding.partNumber.toLowerCase())) {
    score = Math.min(1, score + 0.1);
  }
  return { score, matched };
}

function sentences(input: string): string[] {
  return input
    .split(/(?<=[.!?;:])\s+|\n+/g)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12 && sentence.length <= 400);
}

/**
 * Directness: does the page state a fitment relationship, and how close are the
 * device and the part in the same sentence?
 */
function directnessScore(
  source: ExtractedSource,
  understanding: QueryUnderstanding,
): { score: number; explicit: boolean; opposed: boolean } {
  const deviceTokens = new Set([
    ...tokens(understanding.device ?? ""),
    ...understanding.modelNumbers.map((model) => model.toLowerCase()),
  ]);
  const partTokens = new Set([
    ...tokens(understanding.part ?? ""),
    ...(understanding.partNumber ? [understanding.partNumber.toLowerCase()] : []),
  ]);

  let best = 0;
  let explicit = false;
  let opposed = false;

  for (const sentence of sentences(`${source.title}. ${source.text}`)) {
    const lower = sentence.toLowerCase();
    const mentionsDevice = [...deviceTokens].some((token) => lower.includes(token));
    const mentionsPart = [...partTokens].some((token) => lower.includes(token));
    const supports = EXPLICIT_SUPPORT.some((pattern) => pattern.test(lower));
    const opposes = EXPLICIT_OPPOSE.some((pattern) => pattern.test(lower));

    if (supports && mentionsDevice && mentionsPart) {
      explicit = true;
      best = Math.max(best, 1);
    } else if ((supports || opposes) && (mentionsDevice || mentionsPart)) {
      best = Math.max(best, 0.6);
    } else if (mentionsDevice && mentionsPart) {
      best = Math.max(best, 0.45);
    } else if (mentionsPart || mentionsDevice) {
      best = Math.max(best, 0.2);
    }
    if (opposes && mentionsDevice && mentionsPart) opposed = true;
  }

  return { score: best === 0 ? 0.1 : best, explicit, opposed };
}

function modelSpecificityScore(
  source: ExtractedSource,
  understanding: QueryUnderstanding,
): { score: number; note: string | null } {
  const haystack = `${source.title} ${source.text}`.toLowerCase();
  const exact = understanding.modelNumbers.find((model) => haystack.includes(model.toLowerCase()));
  if (exact) return { score: 1, note: `Names the exact model number ${exact}.` };

  const deviceTokens = tokens(understanding.device ?? "");
  if (deviceTokens.length > 0 && deviceTokens.every((token) => haystack.includes(token))) {
    return { score: 0.65, note: "Names the device family but no exact model number." };
  }
  if (deviceTokens.some((token) => haystack.includes(token))) {
    return { score: 0.4, note: "Mentions part of the device name only." };
  }
  return { score: 0, note: null };
}

function partSpecificityScore(
  source: ExtractedSource,
  understanding: QueryUnderstanding,
): { score: number; note: string | null } {
  const haystack = `${source.title} ${source.text}`.toLowerCase();
  if (understanding.partNumber && haystack.includes(understanding.partNumber.toLowerCase())) {
    return { score: 1, note: `Quotes the OEM part number ${understanding.partNumber}.` };
  }
  const partTokens = tokens(understanding.part ?? "");
  if (partTokens.length > 0 && partTokens.every((token) => haystack.includes(token))) {
    return { score: 0.75, note: "Names the exact part described in the question." };
  }
  if (partTokens.some((token) => haystack.includes(token)) || haystack.includes(understanding.partCategory)) {
    return { score: 0.45, note: "Mentions the part category but not the exact part." };
  }
  return { score: 0.1, note: null };
}

function recencyScore(source: ExtractedSource): { score: number; note: string | null } {
  if (!source.publishedAt) return { score: 0.5, note: null };
  const published = Date.parse(source.publishedAt);
  if (Number.isNaN(published)) return { score: 0.5, note: null };
  const ageDays = (Date.now() - published) / 86_400_000;
  if (ageDays <= 180) return { score: 1, note: "Published in the last 6 months." };
  if (ageDays <= 365) return { score: 0.8, note: "Published in the last year." };
  if (ageDays <= 730) return { score: 0.6, note: "Published 1–2 years ago." };
  return { score: 0.4, note: "Published more than two years ago." };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                */
/* -------------------------------------------------------------------------- */

export interface EvaluationContext {
  understanding: QueryUnderstanding;
  /** Which of our generated queries surfaced each canonical URL. */
  queriesByUrl?: Map<string, string[]>;
}

export function evaluateSources(
  sources: ExtractedSource[],
  context: EvaluationContext,
  /** Search providers that contributed results to this run. */
  providerIds: string[] = [],
): EvaluatedSource[] {
  const terms = keyTerms(context.understanding);
  const seenDomains = new Map<string, number>();

  const evaluated = sources.map((source) => {
    const profile = profileDomain(source.domain);
    const authority = TIER_AUTHORITY[profile.tier];
    const relevance = relevanceScore(source, terms, context.understanding);
    const directness = directnessScore(source, context.understanding);
    const model = modelSpecificityScore(source, context.understanding);
    const part = partSpecificityScore(source, context.understanding);
    const recency = recencyScore(source);

    const domainSeen = seenDomains.get(source.domain) ?? 0;
    seenDomains.set(source.domain, domainSeen + 1);
    const independence = domainSeen === 0 ? 1 : 0.35;

    const notes: string[] = [`Tier ${profile.tier}: ${profile.label}.`];
    if (model.note) notes.push(model.note);
    if (part.note) notes.push(part.note);
    if (recency.note) notes.push(recency.note);
    if (relevance.matched.length > 0) {
      notes.push(`Matches ${relevance.matched.length} key term(s): ${relevance.matched.slice(0, 6).join(", ")}.`);
    }
    if (directness.opposed) notes.push("Contains language describing a different part or a non-fit.");
    if (independence < 1) notes.push("Another page from the same domain was already retrieved.");
    if (source.injectionFindings) {
      notes.push(`${source.injectionFindings} instruction-like span(s) were neutralised.`);
    }
    if (source.usedProviderContent) notes.push("Content came from the search provider, not a direct fetch.");
    if (!source.fetched && source.failureReason) notes.push(`Page could not be read: ${source.failureReason}`);

    const total = clamp01(
      authority * WEIGHTS.authority +
        relevance.score * WEIGHTS.relevance +
        directness.score * WEIGHTS.directness +
        model.score * WEIGHTS.modelSpecificity +
        part.score * WEIGHTS.partSpecificity +
        independence * WEIGHTS.independence +
        recency.score * WEIGHTS.recency +
        (directness.explicit ? 1 : 0) * WEIGHTS.explicitClaim,
    );

    const quality: SourceQuality = {
      total: round2(total),
      tier: profile.tier,
      tierLabel: profile.label,
      authority: round2(authority),
      relevance: round2(relevance.score),
      directness: round2(directness.score),
      modelSpecificity: round2(model.score),
      partSpecificity: round2(part.score),
      recency: round2(recency.score),
      independence: round2(independence),
      explicitClaim: directness.explicit ? 1 : 0,
      notes,
    };

    return {
      ...source,
      quality,
      queries: context.queriesByUrl?.get(source.canonicalUrl) ?? [],
      providerIds: [...providerIds],
    } satisfies EvaluatedSource;
  });

  return evaluated.sort((a, b) => b.quality.total - a.quality.total);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
