/** Small text helpers shared by the research pipeline. */

export function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Lowercase, diacritic-free, punctuation-collapsed form used for matching. */
export function normalizeForMatch(input: string): string {
  return stripDiacritics(input)
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^a-z0-9+\-.'/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalised question used as the research cache key. Keeps the user's words
 * (no synonym rewriting) but removes noise so trivial variants hit the cache.
 */
export function normalizeQuestion(input: string): string {
  return normalizeForMatch(input)
    .replace(/\b(can i|can you|please|pls|hi|hello|hey|do i need|is it possible to|i want to|i need to|help me)\b/g, " ")
    .replace(/\b(what|which|does|do|is|are|will|would|the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits page text into sentences/segments suitable for evidence extraction. */
export function splitSegments(text: string): string[] {
  return text
    .split(/(?<=[.!?;•|])\s+|\n+/)
    .map(collapseWhitespace)
    .filter((segment) => segment.length > 0);
}

export function truncate(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/** Extracts a short, quotable evidence snippet around a match. */
export function snippetAround(text: string, index: number, needleLength: number, radius = 220): string {
  const start = Math.max(0, index - Math.floor(radius / 2));
  const end = Math.min(text.length, index + needleLength + Math.floor(radius / 2));
  let snippet = collapseWhitespace(text.slice(start, end));
  if (start > 0) snippet = `…${snippet}`;
  if (end < text.length) snippet = `${snippet}…`;
  return snippet;
}

/** Token-overlap similarity (Jaccard) used for dedupe and clustering. */
export function jaccard(a: string, b: string): number {
  const setA = new Set(normalizeForMatch(a).split(" ").filter((t) => t.length > 2));
  const setB = new Set(normalizeForMatch(b).split(" ").filter((t) => t.length > 2));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection += 1;
  return intersection / (setA.size + setB.size - intersection);
}

export function titleCase(input: string): string {
  return input
    .split(/\s+/)
    .map((word) =>
      word.length <= 2 || /^[A-Z0-9]+$/.test(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Removes zero-width characters and control noise that break matching. */
/**
 * Normalises page text: removes zero-width noise, collapses runs of spaces and
 * joins soft line wrapping (single newlines) back into sentences while keeping
 * real paragraph breaks (blank lines) — evidence extraction depends on sentences
 * staying intact.
 */
export function cleanPageText(input: string): string {
  return input
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/([^\n])\n(?!\n)/g, "$1 ")
    .trim();
}
