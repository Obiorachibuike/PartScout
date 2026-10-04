import { normalizeForMatch } from "@/lib/text";

/**
 * Device / model-number parsing.
 *
 * Phone repair is full of near-identical names: "Galaxy A15 4G" vs "Galaxy A15
 * 5G" are different phones, and "SM-A155F" vs "SM-A155M" are different regional
 * SKUs of the same 4G phone. We therefore keep three separate concepts and never
 * collapse them:
 *
 *   familyKey   "samsung galaxy a15"   → the marketing family
 *   variantKey  "samsung galaxy a15|4g" → family + explicit variant marker
 *   modelNumber "SM-A155F"             → the exact SKU
 */

export interface BrandDefinition {
  id: string;
  label: string;
  aliases: string[];
  /** Primary manufacturer domains — used by the source quality engine. */
  domains: string[];
}

export const BRANDS: BrandDefinition[] = [
  { id: "samsung", label: "Samsung", aliases: ["samsung", "galaxy", "sm-", "samsung galaxy"], domains: ["samsung.com", "samsungmobilepress.com", "samsungparts.com"] },
  { id: "apple", label: "Apple", aliases: ["apple", "iphone", "ipad", "ipod", "macbook"], domains: ["apple.com", "support.apple.com", "selfservicerepair.com"] },
  { id: "google", label: "Google", aliases: ["google", "pixel", "pixel fold"], domains: ["store.google.com", "support.google.com", "pixelrepair.withgoogle.com"] },
  { id: "xiaomi", label: "Xiaomi", aliases: ["xiaomi", "mi ", "miui", "redmi", "poco"], domains: ["mi.com", "xiaomi.com", "mi.co"] },
  { id: "huawei", label: "Huawei", aliases: ["huawei", "honor"], domains: ["huawei.com", "consumer.huawei.com"] },
  { id: "oppo", label: "OPPO", aliases: ["oppo", "cph"], domains: ["oppo.com"] },
  { id: "vivo", label: "Vivo", aliases: ["vivo", "iqoo"], domains: ["vivo.com", "iqoo.com"] },
  { id: "oneplus", label: "OnePlus", aliases: ["oneplus", "one plus"], domains: ["oneplus.com"] },
  { id: "realme", label: "Realme", aliases: ["realme", "rmx"], domains: ["realme.com"] },
  { id: "motorola", label: "Motorola", aliases: ["motorola", "moto", "xt"], domains: ["motorola.com"] },
  { id: "nokia", label: "Nokia", aliases: ["nokia", "ta-"], domains: ["nokia.com", "hmdglobal.com"] },
  { id: "sony", label: "Sony", aliases: ["sony", "xperia"], domains: ["sony.com", "sonymobile.com"] },
  { id: "lg", label: "LG", aliases: ["lg ", "lg-", "lg electronics"], domains: ["lg.com"] },
  { id: "nothing", label: "Nothing", aliases: ["nothing phone", "cmf by nothing"], domains: ["nothing.tech"] },
  { id: "asus", label: "Asus", aliases: ["asus", "zenfone", "rog phone"], domains: ["asus.com"] },
  { id: "lenovo", label: "Lenovo", aliases: ["lenovo", "motorola lenovo"], domains: ["lenovo.com"] },
  { id: "zte", label: "ZTE", aliases: ["zte", "axon", "blade"], domains: ["zte.com.cn"] },
  { id: "tecno", label: "Tecno", aliases: ["tecno", "camon", "spark"], domains: ["tecno-mobile.com"] },
  { id: "infinix", label: "Infinix", aliases: ["infinix", "hot ", "note "], domains: ["infinixmobility.com"] },
  { id: "itel", label: "Itel", aliases: ["itel"], domains: ["itel-mobile.com"] },
  { id: "meizu", label: "Meizu", aliases: ["meizu"], domains: ["meizu.com"] },
  { id: "tcl", label: "TCL", aliases: ["tcl", "alcatel"], domains: ["tcl.com", "alcatel-mobile.com"] },
  { id: "fairphone", label: "Fairphone", aliases: ["fairphone"], domains: ["fairphone.com"] },
  { id: "blackview", label: "Blackview", aliases: ["blackview", "doogee", "oukitel", "umidigi", "cubot"], domains: ["blackview.hk"] },
  { id: "sharp", label: "Sharp", aliases: ["sharp", "aquos"], domains: ["sharp.co.jp"] },
];

const BRAND_BY_ALIAS = new Map<string, BrandDefinition>();
for (const brand of BRANDS) {
  for (const alias of brand.aliases) BRAND_BY_ALIAS.set(alias.trim(), brand);
  BRAND_BY_ALIAS.set(brand.id, brand);
}

export function findBrand(text: string): BrandDefinition | null {
  const normalized = ` ${normalizeForMatch(text)} `;
  let best: { brand: BrandDefinition; length: number } | null = null;
  for (const brand of BRANDS) {
    for (const alias of brand.aliases) {
      const needle = ` ${alias.trim()}`;
      if (normalized.includes(`${needle} `) || normalized.includes(needle) && normalized.includes(`${needle}`)) {
        if (!best || alias.length > best.length) best = { brand, length: alias.length };
      }
    }
  }
  return best?.brand ?? null;
}

/**
 * Model-number patterns, ordered from most specific to least specific. Each
 * entry records the brand it implies so we can prefer brand-consistent matches.
 */
interface ModelPattern {
  brand: string | null;
  pattern: RegExp;
  kind: "device_model" | "part_number";
  note: string;
}

export const MODEL_PATTERNS: ModelPattern[] = [
  { brand: "samsung", pattern: /\bSM-[A-Z]\d{2,4}[A-Z0-9]{0,7}\b/gi, kind: "device_model", note: "Samsung SM- SKU" },
  { brand: "samsung", pattern: /\bGT-[A-Z]\d{3,4}[A-Z0-9]{0,4}\b/gi, kind: "device_model", note: "Legacy Samsung GT- SKU" },
  { brand: "apple", pattern: /\bA(?:1[0-9]{3}|2[0-9]{3}|3[0-9]{3})\b/g, kind: "device_model", note: "Apple Axxxx part/model number" },
  { brand: "xiaomi", pattern: /\b(?:M|2)\d{7,9}[A-Z]{1,4}\b/g, kind: "device_model", note: "Xiaomi internal model" },
  { brand: "realme", pattern: /\bRMX\d{4,6}\b/gi, kind: "device_model", note: "Realme RMX model" },
  { brand: "oppo", pattern: /\bCPH\d{3,5}\b/gi, kind: "device_model", note: "OPPO CPH model" },
  { brand: "vivo", pattern: /\bV(?:19|20|21|22|23|24|25|27|29)\d{2}[A-Z]?\b/g, kind: "device_model", note: "Vivo model" },
  { brand: "oneplus", pattern: /\b(?:NE|IN|LE|AC|KB|GM)\d{4}\b/g, kind: "device_model", note: "OnePlus model" },
  { brand: "motorola", pattern: /\bXT\d{4,5}(?:-\d{1,2})?\b/gi, kind: "device_model", note: "Motorola XT model" },
  { brand: "nokia", pattern: /\bTA-\d{3,4}\b/gi, kind: "device_model", note: "Nokia TA- model" },
  { brand: "huawei", pattern: /\b(?:ANE|MAR|VOG|ELE|JNY|CLT|EVA|LON|WAS|FIG|PCT|DUB|PAR|YAL|CET|NOH|ANA|LYA)[A-Z0-9-]{1,8}\b/g, kind: "device_model", note: "Huawei codename model" },
  { brand: "google", pattern: /\b(?:G|GL|GU|GA|GV|GD|GH|GK|GR)\d{3,4}[A-Z]{0,3}\b/g, kind: "device_model", note: "Google Pixel model" },
];

/** Part-number shapes commonly printed on replacement parts. */
export const PART_NUMBER_PATTERNS: RegExp[] = [
  /\bGH\d{2}-\d{4,6}[A-Z]\b/gi, // Samsung display/flex assemblies: GH82-22989A
  /\bEB-[A-Z]{1,3}\d{2,4}[A-Z0-9]{0,8}\b/gi, // Samsung batteries: EB-BG991ABY
  /\b(?:BN|BP|BM)\d{1,2}[A-Z0-9]?\b/g, // Xiaomi/Apple style cells: BN5A, BN41, BP40
  /\bB[PS]-[A-Z0-9]{4,12}\b/gi, // supplier battery codes
  /\b821-\d{4,5}-[A-Z0-9]{1,3}\b/gi, // Apple flex cables: 821-01234-A
  /\b\d{3}-\d{4,5}-[A-Z]\b/g, // Apple-style 3-5-1 part numbers
  /\b[A-Z]{3}\d{3,4}[A-Z]?\b/g, // e.g. DC3300, HB3742 (3 letters avoids SKU prefixes)
  /\b\d{4}-\d{4}-[A-Z0-9]\b/g,
];

/** Tokens that look like part numbers but are device SKUs. */
const DEVICE_SKU_PREFIXES = /^(SM|GT|RMX|CPH|XT|TA|NE|IN|LE|AC|KB|GM)[-\d]/i;

const VARIANT_MARKERS: Array<{ key: string; label: string; pattern: RegExp }> = [
  { key: "5g", label: "5G", pattern: /\b5\s?g\b|5g\b/i },
  { key: "4g", label: "4G", pattern: /\b4\s?g\b|lte\b/i },
  { key: "3g", label: "3G", pattern: /\b3\s?g\b|hspa\b/i },
  { key: "pro", label: "Pro", pattern: /\bpro\b/i },
  { key: "pro-max", label: "Pro Max", pattern: /\bpro\s?max\b/i },
  { key: "max", label: "Max", pattern: /\bmax\b/i },
  { key: "ultra", label: "Ultra", pattern: /\bultra\b/i },
  { key: "plus", label: "Plus", pattern: /\bplus\b|\+/i },
  { key: "mini", label: "mini", pattern: /\bmini\b/i },
  { key: "se", label: "SE", pattern: /\bse\b/i },
  { key: "fe", label: "FE", pattern: /\bfe\b/i },
  { key: "neo", label: "Neo", pattern: /\bneo\b/i },
  { key: "lite", label: "Lite", pattern: /\blite\b/i },
  { key: "xr", label: "XR", pattern: /\bxr\b/i },
  { key: "xs", label: "XS", pattern: /\bxs\b/i },
  { key: "dual-sim", label: "Dual SIM", pattern: /\bdual\s?sim\b|\bds\b|\bdual\b/i },
  { key: "single-sim", label: "Single SIM", pattern: /\bsingle\s?sim\b|\bss\b/i },
  { key: "global", label: "Global", pattern: /\bglobal\b|\binternational\b|\bintl\b/i },
  { key: "us", label: "US", pattern: /\bus\s(?:version|model)\b|\busa\b/i },
  { key: "eu", label: "EU", pattern: /\beu\s(?:version|model)\b|\beuropean\b/i },
  { key: "cn", label: "China", pattern: /\b(china|chinese)\s(?:version|model|variant)\b|\bcn\b/i },
  { key: "india", label: "India", pattern: /\bindia\b|\bindian\b|\bins\b/i },
  { key: "korea", label: "Korea", pattern: /\bkorea\b|\bkorean\b/i },
  { key: "snapdragon", label: "Snapdragon", pattern: /\bsnapdragon\b|\bsd\d{3}\b/i },
  { key: "exynos", label: "Exynos", pattern: /\bexynos\b/i },
  { key: "mediatek", label: "MediaTek", pattern: /\bmediatek\b|\bdimensity\b|\bhelio\b/i },
  { key: "nfc", label: "NFC variant", pattern: /\bnfc\b/i },
  { key: "amoled", label: "AMOLED", pattern: /\bamoled\b|\bsuper amoled\b/i },
  { key: "lcd", label: "LCD", pattern: /\blcd\b|\bips\b|\btft\b|\bincell\b/i },
];

export interface ExtractedModelNumbers {
  /** SKU-like identifiers with reasonable confidence. */
  deviceModels: string[];
  /** Part numbers printed on replacement parts. */
  partNumbers: string[];
}

export function extractModelNumbers(rawText: string, hints: { brand?: string | null } = {}): ExtractedModelNumbers {
  const text = rawText;
  const deviceModels: string[] = [];
  const partNumbers: string[] = [];

  for (const { pattern, kind, brand } of MODEL_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const matches = text.match(regex) ?? [];
    for (const match of matches) {
      const value = normalizeIdentifier(match);
      if (value.length < 4) continue;
      if (hints.brand && brand && hints.brand !== brand) continue;
      if (kind === "device_model") deviceModels.push(value);
    }
  }

  // Brand-agnostic but strongly shaped SKUs (e.g. "SM-A155F" typed lowercase).
  const genericSku = text.match(/\b[a-z]{2}-[a-z]\d{3}[a-z0-9]{0,6}\b/gi) ?? [];
  for (const match of genericSku) {
    const value = normalizeIdentifier(match);
    if (/^(sm|gt|xt|ta|rmx|cph)-/i.test(value)) deviceModels.push(value);
  }

  for (const pattern of PART_NUMBER_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const matches = text.match(regex) ?? [];
    for (const match of matches) {
      if (DEVICE_SKU_PREFIXES.test(match)) continue;
      partNumbers.push(normalizeIdentifier(match));
    }
  }

  return {
    deviceModels: dedupeIdentifiers(deviceModels),
    partNumbers: dedupeIdentifiers(partNumbers),
  };
}

export function extractVariantMarkers(text: string): string[] {
  const found: string[] = [];
  for (const marker of VARIANT_MARKERS) {
    if (marker.pattern.test(text)) found.push(marker.key);
  }
  // "Pro Max" implies "Pro" is not separately meaningful; keep only the most
  // specific of the iPhone-style suffixes.
  if (found.includes("pro-max")) return found.filter((key) => key !== "pro" && key !== "max");
  if (found.includes("max") && found.includes("plus")) return found.filter((key) => key !== "plus");
  return found;
}

export function variantLabel(key: string): string {
  return VARIANT_MARKERS.find((marker) => marker.key === key)?.label ?? key.toUpperCase();
}

/** Uppercases SKUs and removes separators that vary between sites. */
export function normalizeIdentifier(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

function dedupeIdentifiers(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.replace(/-/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/**
 * Tokens that end an extracted device family. Tier words such as "Pro", "Max",
 * "Ultra", "Plus" and "mini" are deliberately NOT in this list — they are part of
 * the marketing name and describe *different devices* (iPhone 11 vs iPhone 11
 * Pro), whereas 4G/5G and regional suffixes are handled as variant markers.
 */
const FAMILY_STOP_WORDS = new Set([
  "can","could","will","would","does","do","is","are","the","a","an","my","this","that","these","those",
  "screen","screens","display","battery","flex","cable","camera","speaker","microphone","housing","cover",
  "glass","button","buttons","sensor","antenna","nfc","charging","charge","port","board","lcd","oled",
  "replacement","compatible","compatibility","work","works","working","fit","fits","use","used","using",
  "phone","phones","model","models","number","part","parts","for","with","on","in","from","and","or",
  "what","which","where","how","why","when","find","need","looking","another","other","other's","same",
  "new","old","original","oem","aftermarket","bought","buy","sell","please","help","tell","me","about",
  "version","variant","edition","series","gen","4g","5g","3g","lte","ds","duos",
]);

/** Generation markers describe the same chassis with different radios. */
export const GENERATION_MARKERS = ["3g", "4g", "5g", "lte"];

/** Regional / configuration markers that rarely change the physical part. */
export const REGION_MARKERS = [
  "us","eu","cn","india","korea","global","international","dual-sim","single-sim","ds","duos",
  "snapdragon","exynos","mediatek","nfc","japan","brazil","latam","middle-east","africa",
];

/** Words that may precede a model token and belong to the family name. */
const FAMILY_PREFIXES = new Set([
  "galaxy","note","redmi","poco","pixel","xperia","zenfone","mate","nova","mi","oneplus","iphone","ipad",
  "moto","realme","camon","spark","hot","blade","axon","aquos","rog","find","reno","f",
]);

function looksLikePartNumberToken(token: string): boolean {
  return /^(bn|eb|gh|b[ps])-?\d|^\d{3}-\d{4}/i.test(token);
}

/**
 * Attempts to read the device family out of free text, e.g.
 *   "Can I use a Samsung A15 screen on another Samsung phone?"
 *   → { brand: samsung, family: "Galaxy A15", markers: ["4g"] }
 */
export interface DeviceMention {
  brand: string | null;
  brandLabel: string | null;
  family: string | null;
  familyKey: string | null;
  raw: string;
  modelNumbers: string[];
  variantMarkers: string[];
}

export function extractDeviceMention(text: string): DeviceMention | null {
  const normalized = normalizeForMatch(text);
  if (!normalized) return null;

  const brand = findBrand(normalized);
  const { deviceModels } = extractModelNumbers(text, { brand: brand?.id ?? null });
  const markers = extractVariantMarkers(text);

  const tokens = normalized.split(" ");
  const brandAliases = brand
    ? [brand.id, ...brand.aliases.map((alias) => alias.trim())].filter(Boolean)
    : [];

  let bestStart = -1;
  let bestAliasLength = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    for (const alias of brandAliases) {
      const aliasTokens = alias.split(" ");
      if (aliasTokens.length === 1) {
        if (token === alias && alias.length > bestAliasLength) {
          bestStart = index;
          bestAliasLength = alias.length;
        }
      } else if (tokens.slice(index, index + aliasTokens.length).join(" ") === alias) {
        if (alias.length > bestAliasLength) {
          bestStart = index;
          bestAliasLength = alias.length;
        }
      }
    }
  }

  // Fallback: no brand word found, but a device-like token exists ("A15 5G",
  // "S21 Ultra", "Note 12"). Part numbers are explicitly excluded.
  if (bestStart < 0) {
    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index]!;
      if (looksLikePartNumberToken(token)) continue;
      const isModelToken = /^[a-z]{1,3}\d{1,4}[a-z]{0,2}$/.test(token) || /^\d{1,2}$/.test(token) && index > 0 && FAMILY_PREFIXES.has(tokens[index - 1]!);
      if (!isModelToken) continue;
      bestStart = FAMILY_PREFIXES.has(tokens[index - 1] ?? "") ? index - 1 : index;
      break;
    }
  }

  let family: string | null = null;
  if (bestStart >= 0) {
    const collected: string[] = [];
    for (let cursor = bestStart; cursor < tokens.length && collected.length < 5; cursor += 1) {
      const token = tokens[cursor]!;
      if (collected.length > 0 && FAMILY_STOP_WORDS.has(token)) break;
      collected.push(token);
    }
    family = collected.join(" ").trim() || null;
  }

  // Fall back to a model-number-led device ("SM-A155F charging flex")
  const raw: string = family ?? deviceModels[0] ?? "";
  if (!raw && !brand) return null;

  return {
    brand: brand?.id ?? null,
    brandLabel: brand?.label ?? null,
    family: family ? humaniseFamily(family, brand?.label ?? null) : deviceModels[0] ? deviceModels[0]! : null,
    familyKey: family ? buildFamilyKey(family, brand?.id ?? null) : deviceModels[0] ? buildFamilyKey(deviceModels[0]!, brand?.id ?? null) : null,
    raw,
    modelNumbers: deviceModels,
    variantMarkers: markers,
  };
}

function humaniseFamily(family: string, brandLabel: string | null): string {
  const cleaned = family
    .replace(/\b(\d+)\s?(g|gb)\b/g, (_match, num: string, unit: string) => `${num}${unit.toUpperCase()}`)
    .replace(/\b(iphone|ipad|galaxy|pixel|redmi|poco|note|pro|max|plus|ultra|mini|se|lite|neo|fold|flip|edge|fe)\b/g, (word) =>
      word === "iphone" || word === "ipad"
        ? word.charAt(0).toUpperCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1),
    );
  const tokens = cleaned.split(" ");
  const hasBrandWord = brandLabel ? cleaned.toLowerCase().includes(brandLabel.toLowerCase()) : false;
  const title = tokens
    .map((token) =>
      token.length <= 2 && /^[a-z]{1,2}$/i.test(token) && !/^(a|s|m)\d/i.test(token)
        ? token.toUpperCase()
        : token.charAt(0).toUpperCase() + token.slice(1),
    )
    .join(" ");
  return hasBrandWord ? title : `${brandLabel ?? ""} ${title}`.trim();
}

/**
 * Family key with generation/region markers removed, e.g.
 *   "samsung galaxy a15 4g" → "samsung galaxy a15"
 * Two devices sharing a base key but differing in variant are *candidates* for
 * shared parts, never assumed interchangeable — the engine requires explicit
 * cross-variant evidence.
 */
export function buildFamilyBaseKey(familyKey: string): string {
  const markers = new Set([...GENERATION_MARKERS, ...REGION_MARKERS]);
  return familyKey
    .split(" ")
    .filter((token) => token.length > 0 && !markers.has(token))
    .join(" ")
    .trim();
}

export function buildFamilyKey(family: string, brand: string | null): string {
  let key = normalizeForMatch(family)
    .replace(/\b(galaxy|phone|smartphone|mobile)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Always compare using the lowercase brand id, never the display label.
  const brandId = (brand ? brand.toLowerCase().match(/[a-z]+/g)?.join("") : undefined) ?? findBrand(family)?.id ?? null;
  if (brandId && key && !key.startsWith(brandId)) key = `${brandId} ${key}`;
  return key.trim();
}

/**
 * Infers the manufacturer from the shape of a model number. Pages frequently
 * write "A15 4G" without the brand while quoting "SM-A155F" in the same line —
 * this keeps those claims in the same family as "Samsung Galaxy A15".
 */
export function inferBrandFromModelNumbers(modelNumbers: string[]): BrandDefinition | null {
  for (const model of modelNumbers) {
    const upper = model.toUpperCase();
    if (/^SM-|^GT-/.test(upper)) return BRAND_BY_ALIAS.get("samsung") ?? null;
    if (/^RMX/.test(upper)) return BRAND_BY_ALIAS.get("realme") ?? null;
    if (/^CPH/.test(upper)) return BRAND_BY_ALIAS.get("oppo") ?? null;
    if (/^XT\d/.test(upper)) return BRAND_BY_ALIAS.get("motorola") ?? null;
    if (/^TA-/.test(upper)) return BRAND_BY_ALIAS.get("nokia") ?? null;
    if (/^M\d{4}[A-Z]/.test(upper) || /^\d{8,9}[A-Z]{2,4}$/.test(upper)) return BRAND_BY_ALIAS.get("xiaomi") ?? null;
    if (/^A(1[0-9]{3}|2[0-9]{3}|3[0-9]{3})$/.test(upper)) return BRAND_BY_ALIAS.get("apple") ?? null;
  }
  return null;
}

/** Tokens of a device name that carry its model number ("A15" → "a15"). */
export function deviceCoreTokens(device: string | null): string[] {
  if (!device) return [];
  return normalizeForMatch(device)
    .split(" ")
    .filter((token) => token.length >= 2 && /\d/.test(token));
}

/** Family key + explicit variant marker, e.g. "samsung galaxy a15|4g". */
export function buildVariantKey(familyKey: string | null, variantMarkers: string[]): string | null {
  if (!familyKey) return null;
  const significant = variantMarkers.filter((marker) =>
    ["4g", "5g", "3g", "pro", "pro-max", "max", "ultra", "plus", "mini", "se", "fe", "lite", "neo", "dual-sim", "snapdragon", "exynos", "mediatek"].includes(marker),
  );
  return `${familyKey}|${significant.sort().join(",")}`;
}

export function familyKeyToTitle(familyKey: string): string {
  return familyKey
    .split(" ")
    .map((token) => (token.length <= 2 ? token.toUpperCase() : token.charAt(0).toUpperCase() + token.slice(1)))
    .join(" ");
}

/**
 * True when two claims refer to the same family but the variants are explicitly
 * different (A15 4G vs A15 5G). Used to flag risky cross-variant extrapolation.
 */
export function variantsConflict(a: string[], b: string[]): { conflict: boolean; onlyA: string[]; onlyB: string[] } {
  const setA = new Set(a);
  const setB = new Set(b);
  const generations = ["3g", "4g", "5g"];
  const genA = generations.filter((gen) => setA.has(gen));
  const genB = generations.filter((gen) => setB.has(gen));
  const onlyA = [...setA].filter((key) => !setB.has(key));
  const onlyB = [...setB].filter((key) => !setA.has(key));
  if (genA.length > 0 && genB.length > 0 && genA[0] !== genB[0]) {
    return { conflict: true, onlyA, onlyB };
  }
  return { conflict: false, onlyA, onlyB };
}
