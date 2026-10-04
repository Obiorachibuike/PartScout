import type { PartCategory } from "@/types/research";
import { PART_CATEGORY_DEFINITIONS } from "@/lib/domain/parts";
import { normalizeForMatch } from "@/lib/text";

export interface PartAliasEntry {
  alias: string;
  category: PartCategory;
}

/** Every alias across all categories, longest-first so specific phrases win. */
export const PART_ALIAS_INDEX: PartAliasEntry[] = Object.values(PART_CATEGORY_DEFINITIONS)
  .flatMap((definition) => definition.aliases.map((alias) => ({ alias, category: definition.id })))
  .sort((a, b) => b.alias.length - a.alias.length);

export interface PartMention {
  category: PartCategory;
  /** Alias that triggered the match. */
  matchedAlias: string;
  /** Aliases for the winning category (used to build queries). */
  aliases: string[];
  /** How much text was matched — longer means more specific. */
  specificity: number;
}

/**
 * Finds the part the user is asking about. Longest-match-wins avoids the classic
 * failure where "charging flex" is read as just "flex".
 */
export function findPartMention(text: string): PartMention | null {
  const normalized = ` ${normalizeForMatch(text)} `;
  let best: PartAliasEntry | null = null;
  for (const entry of PART_ALIAS_INDEX) {
    const alias = ` ${normalizeForMatch(entry.alias)}`;
    if (normalized.includes(alias) || normalized.includes(`${alias}s `) || normalized.includes(`${alias} `)) {
      if (!best || entry.alias.length > best.alias.length) best = entry;
    }
  }
  if (!best) return null;
  const definition = PART_CATEGORY_DEFINITIONS[best.category];
  return {
    category: best.category,
    matchedAlias: best.alias,
    aliases: definition.aliases,
    specificity: normalizeForMatch(best.alias).split(" ").length,
  };
}

export interface CanonicalPartTerm {
  /** Canonical display name for the part concept. */
  canonical: string;
  category: PartCategory | null;
  /** Notes surfaced in the UI when terminology is loose. */
  notes: string[];
  /** True when the wording is too generic to identify an exact assembly. */
  ambiguous: boolean;
}

const CANONICAL_TERMS: Array<{ pattern: RegExp; canonical: string; category: PartCategory | null; ambiguous?: boolean; note?: string }> = [
  { pattern: /\blcd (assembly|module|screen|display)\b|\blcd\b/i, canonical: "LCD display assembly", category: "screen", note: "“LCD” describes the panel technology; OLED and LCD assemblies are not interchangeable." },
  { pattern: /\boled\b|\bamoled\b|\bsuper amoled\b/i, canonical: "OLED display assembly", category: "screen", note: "OLED assemblies are model specific and not interchangeable with LCD variants." },
  { pattern: /\bdisplay assembly\b|\bdisplay\b/i, canonical: "display assembly", category: "screen", ambiguous: true, note: "“Display” can mean panel only, panel+frame, or a full service pack." },
  { pattern: /\bscreen\b|\bdigitizer\b|\btouch ?screen\b/i, canonical: "screen assembly", category: "screen", ambiguous: true, note: "“Screen” is generic — verify whether the frame and flex are included." },
  { pattern: /\bbattery\b|\bcell\b/i, canonical: "battery", category: "battery" },
  { pattern: /\bcharging (flex|port flex|connector flex|ribbon)\b|\bdock flex\b/i, canonical: "charging flex", category: "charging_flex" },
  { pattern: /\bcharging (board|pcb)\b|\busb board\b|\bdaughter ?board\b|\bsub ?board\b/i, canonical: "charging board", category: "charging_board" },
  { pattern: /\bpower (flex|button flex|switch)\b/i, canonical: "power flex", category: "power_flex" },
  { pattern: /\bvolume (flex|button flex|key flex)\b/i, canonical: "volume flex", category: "volume_flex" },
  { pattern: /\bback (cover|glass|panel)\b|\brear (cover|glass|panel)\b|\bbattery cover\b/i, canonical: "back cover", category: "back_cover" },
  { pattern: /\b(mid ?frame|chassis|housing|frame)\b/i, canonical: "housing / frame", category: "housing", ambiguous: true, note: "“Housing” sometimes means the midframe only and sometimes the full assembly." },
  { pattern: /\b(camera|rear camera|front camera|selfie camera)\b/i, canonical: "camera module", category: "camera", ambiguous: true, note: "Front and rear cameras are separate parts — confirm which one." },
  { pattern: /\b(loud ?speaker|speaker|buzzer|ringer)\b/i, canonical: "speaker", category: "speaker" },
  { pattern: /\b(earpiece|ear speaker)\b/i, canonical: "earpiece speaker", category: "speaker" },
  { pattern: /\bmicrophone\b|\bmic\b/i, canonical: "microphone", category: "microphone" },
  { pattern: /\bfingerprint\b|\btouch id\b|\bbiometric\b/i, canonical: "fingerprint sensor", category: "fingerprint" },
  { pattern: /\bantenna\b/i, canonical: "antenna", category: "antenna" },
  { pattern: /\bnfc\b/i, canonical: "NFC component", category: "nfc" },
  { pattern: /\bwireless charging\b|\bqi coil\b|\bcharging coil\b/i, canonical: "wireless charging coil", category: "wireless_charging" },
];

/**
 * Maps the loose wording a technician uses onto a canonical part concept.
 * IMPORTANT: normalisation never implies interchangeability — two parts with the
 * same canonical name may still be different assemblies (we surface that as a
 * note so the compatibility engine and the UI stay conservative).
 */
export function canonicalizePartTerm(term: string): CanonicalPartTerm {
  for (const entry of CANONICAL_TERMS) {
    if (entry.pattern.test(term)) {
      return {
        canonical: entry.canonical,
        category: entry.category,
        notes: entry.note ? [entry.note] : [],
        ambiguous: Boolean(entry.ambiguous),
      };
    }
  }
  const mention = findPartMention(term);
  if (mention) {
    return {
      canonical: PART_CATEGORY_DEFINITIONS[mention.category].label.toLowerCase(),
      category: mention.category,
      notes: [],
      ambiguous: true,
    };
  }
  return { canonical: term.trim(), category: null, notes: [], ambiguous: true };
}

/** Terms that indicate the claim is about a specific assembly instead of a category. */
export const SPECIFIC_ASSEMBLY_TERMS = [
  "assembly",
  "service pack",
  "with frame",
  "module",
  "flex",
  "cable",
  "complete",
  "oem",
];
