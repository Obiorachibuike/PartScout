import * as cheerio from "cheerio";
import type { ExtractedSource, SearchResult } from "@/types/research";
import { canonicalize, sourceCacheKey, stableHash } from "@/lib/hash";
import { logger as defaultLogger } from "@/lib/logger";
import { limits } from "@/lib/config";
import { fetchTextCapped } from "@/lib/providers/http";
import { assertFetchableUrl, domainOf, isAllowedContentType } from "@/lib/safety/ssrf";
import { scanAndNeutralise } from "@/lib/safety/untrusted";
import { cleanPageText, collapseWhitespace, truncate } from "@/lib/text";
import type { UsageTracker } from "@/lib/research/usage";

/**
 * Stage 4 — content extraction.
 *
 * Priority order for every candidate source:
 *   1. Provider-supplied page content (Tavily/Exa already return cleaned text)
 *   2. Our own fetch, guarded by SSRF checks and byte/time limits
 *   3. The search snippet alone (flagged — it lowers the source quality score)
 *
 * Inline content is normalised through the untrusted-input scanner so that
 * instruction-like text can never reach the model as an order.
 */

const USER_AGENT =
  "PartScoutBot/1.0 (+https://github.com/PartScout; phone-parts compatibility research)";

const STRIP_SELECTORS = [
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "canvas",
  "iframe",
  "object",
  "embed",
  "form",
  "nav",
  "aside",
  "footer",
  "header",
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[aria-hidden="true"]',
  ".cookie",
  ".cookies",
  "#cookie",
  ".cookie-banner",
  ".newsletter",
  ".breadcrumb",
  ".social",
  ".advertisement",
  ".ads",
  ".sidebar",
  ".menu",
];

const CONTENT_SELECTORS = [
  "main",
  "article",
  '[role="main"]',
  "#content",
  "#main",
  ".product-description",
  ".product-details",
  ".product__description",
  ".specifications",
  ".features",
  ".entry-content",
  ".post-content",
  ".rte",
];

export interface ExtractSourcesOptions {
  tracker?: UsageTracker;
  signal?: AbortSignal;
  maxPagesToFetch?: number;
  logger?: typeof defaultLogger;
}

export async function extractSources(
  results: SearchResult[],
  options: ExtractSourcesOptions = {},
): Promise<ExtractedSource[]> {
  const log = options.logger ?? defaultLogger;
  const maxFetches = options.maxPagesToFetch ?? limits.maxPagesToFetch;
  const urlsWithContent = results.filter((result) => Boolean(result.rawContent)).length;

  // Prefer sources that look most promising when the fetch budget is limited.
  const ranked = [...results].sort((a, b) => fetchPriority(b) - fetchPriority(a));
  const fetchBudget = Math.max(0, maxFetches - urlsWithContent);

  const sources: ExtractedSource[] = [];

  // Inline content needs no network I/O and must never block on the fetch budget.
  for (const result of ranked) {
    if (result.rawContent) {
      const source = buildSourceFromInline(result);
      sources.push(source);
    }
  }

  const needsFetch = ranked.filter((result) => !result.rawContent);
  const fetchPlan = needsFetch.slice(0, fetchBudget);

  const fetched = await Promise.all(
    fetchPlan.map(async (result) => {
      try {
        const source = await fetchSource(result, options);
        options.tracker?.recordPageFetch(1);
        return source;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.debug("page fetch failed; falling back to snippet", { url: result.url, error: message.slice(0, 200) });
        return buildSourceFromSnippet(result, message);
      }
    }),
  );
  sources.push(...fetched);

  // Anything beyond the fetch budget is still represented by its snippet.
  for (const result of needsFetch.slice(fetchPlan.length)) {
    sources.push(buildSourceFromSnippet(result, "fetch budget exhausted"));
  }

  const deduped = dedupeSources(sources);
  log.debug("content extraction complete", {
    candidates: results.length,
    inline: urlsWithContent,
    fetched: fetchPlan.length,
    kept: deduped.length,
  });
  return deduped;
}

function fetchPriority(result: SearchResult): number {
  const domain = domainOf(result.url);
  let score = (result.score ?? 0) * 10;
  if (/manufacturer|samsung|apple|support\./i.test(domain)) score += 4;
  if (/(repair|parts|supplier|spare|mobile|gsm|fix)/i.test(domain)) score += 3;
  if (/(forum|reddit|stackexchange|quora)/i.test(domain)) score += 1;
  if (/\.(pdf|zip|jpg|png)$/i.test(result.url)) score -= 5;
  if (result.snippet.length > 120) score += 1;
  return score;
}

function buildSourceFromInline(result: SearchResult): ExtractedSource {
  const raw = result.rawContent ?? "";
  const looksLikeHtml = /<\s*(html|body|div|p|h1|span)[\s>]/i.test(raw);
  const text = looksLikeHtml ? htmlToText(raw, limits.maxPageTextChars) : cleanPageText(raw);
  const scanned = scanAndNeutralise(text);
  const domain = domainOf(result.url);
  return {
    id: stableHash({ url: canonicalize(result.url) }).slice(0, 16),
    url: result.url,
    canonicalUrl: canonicalize(result.url),
    domain,
    siteName: siteNameFor(domain),
    title: collapseWhitespace(result.title) || domain,
    snippet: collapseWhitespace(result.snippet),
    publishedAt: result.publishedAt,
    text: truncate(scanned.clean, limits.maxPageTextChars),
    fetched: false,
    usedProviderContent: true,
    wordCount: wordCount(scanned.clean),
    injectionFindings: scanned.findings.length,
  };
}

function buildSourceFromSnippet(result: SearchResult, failureReason?: string): ExtractedSource {
  const domain = domainOf(result.url);
  const snippet = collapseWhitespace(result.snippet);
  return {
    id: stableHash({ url: canonicalize(result.url) }).slice(0, 16),
    url: result.url,
    canonicalUrl: canonicalize(result.url),
    domain,
    siteName: siteNameFor(domain),
    title: collapseWhitespace(result.title) || domain,
    snippet,
    publishedAt: result.publishedAt,
    // Only the snippet is available: enough for a weak claim at best.
    text: snippet,
    fetched: false,
    usedProviderContent: false,
    wordCount: wordCount(snippet),
    failureReason,
  };
}

/**
 * Fetches a page with SSRF protection. Redirects are followed manually so every
 * hop is validated — a public URL cannot redirect us into the internal network.
 */
export async function safeFetchPage(
  rawUrl: string,
  options: { signal?: AbortSignal; maxHops?: number } = {},
): Promise<{ body: string; contentType: string | null; finalUrl: string }> {
  let currentUrl = rawUrl;
  const maxHops = options.maxHops ?? 4;

  for (let hop = 0; hop < maxHops; hop += 1) {
    const vetted = await assertFetchableUrl(currentUrl);
    const response = await fetchTextCapped(vetted.url, {
      timeoutMs: limits.pageFetchTimeoutMs,
      maxBytes: limits.maxFetchBytes,
      signal: options.signal,
      userAgent: USER_AGENT,
      ip: vetted.ip,
      host: new URL(vetted.url).hostname,
    });

    if (response.status >= 300 && response.status < 400) {
      // Manual redirect handling: resolve Location and validate it next loop.
      const location = extractRedirectTarget(response.body);
      if (!location) {
        throw new Error(`Redirect without a usable Location header (HTTP ${response.status})`);
      }
      currentUrl = new URL(location, vetted.url).toString();
      continue;
    }

    if (response.status === 403 || response.status === 401) {
      throw new Error(`Publisher blocked automated access (HTTP ${response.status})`);
    }
    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status} while fetching page`);
    }
    return { body: response.body, contentType: response.contentType, finalUrl: response.finalUrl };
  }
  throw new Error("Too many redirects");
}

function extractRedirectTarget(body: string): string | null {
  const match = body.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+url=([^"'>\s]+)/i);
  return match?.[1] ?? null;
}

async function fetchSource(result: SearchResult, options: ExtractSourcesOptions): Promise<ExtractedSource> {
  const response = await safeFetchPage(result.url, { signal: options.signal });
  if (!isAllowedContentType(response.contentType)) {
    throw new Error(`Unsupported content type ${response.contentType}`);
  }
  const isHtml = (response.contentType ?? "").includes("html") || /<\s*html/i.test(response.body.slice(0, 400));
  const text = isHtml ? htmlToText(response.body, limits.maxPageTextChars) : cleanPageText(response.body);
  const scanned = scanAndNeutralise(text);
  const domain = domainOf(response.finalUrl || result.url);

  return {
    id: stableHash({ url: canonicalize(response.finalUrl || result.url) }).slice(0, 16),
    url: response.finalUrl || result.url,
    canonicalUrl: canonicalize(response.finalUrl || result.url),
    domain,
    siteName: siteNameFor(domain),
    title: collapseWhitespace(result.title) || domain,
    snippet: collapseWhitespace(result.snippet),
    publishedAt: result.publishedAt,
    text: truncate(scanned.clean, limits.maxPageTextChars),
    fetched: true,
    usedProviderContent: false,
    wordCount: wordCount(scanned.clean),
    injectionFindings: scanned.findings.length,
  };
}

/** Extracts readable text from HTML, dropping chrome/boilerplate. */
export function htmlToText(html: string, maxChars: number): string {
  const $ = cheerio.load(html, { scriptingEnabled: false });
  for (const selector of STRIP_SELECTORS) {
    try {
      $(selector).remove();
    } catch {
      // Ignore invalid selectors in exotic documents.
    }
  }

  // Minimal structural type keeps us independent of cheerio's generic node
  // unions while still allowing substitution of the best content container.
  type TextContainer = {
    text(): string;
    find(selector: string): { each(callback: (index: number, element: unknown) => void): void };
    prepend(content: string): unknown;
  };

  let container = $("body") as unknown as TextContainer;
  for (const selector of CONTENT_SELECTORS) {
    const candidate = $(selector).first() as unknown as TextContainer & { length: number };
    if (candidate.length && candidate.text().trim().length > 400) {
      container = candidate;
      break;
    }
  }

  // Insert line breaks around block elements so sentences stay separable.
  // Double newline = paragraph/list-item boundary; single newlines inside a
  // paragraph are line wrapping and are joined back into one sentence later.
  container.find("p,div,li,tr,h1,h2,h3,h4,h5,h6,br,section,article,ul,ol,table,td,th,dd,dt").each((_, element) => {
    $(element as never).prepend("\n\n");
  });

  const raw = container.text() || $.root().text();
  return truncate(cleanPageText(raw), maxChars);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function siteNameFor(domain: string): string {
  if (!domain) return "unknown source";
  const parts = domain.split(".");
  const core = parts.length > 2 ? parts[parts.length - 3]! : parts[0]!;
  return core.charAt(0).toUpperCase() + core.slice(1);
}

/**
 * Removes near-duplicate pages (same domain and very similar title) so one site
 * listing the same catalogue three times cannot look like three sources.
 */
export function dedupeSources(sources: ExtractedSource[]): ExtractedSource[] {
  const byCanonical = new Map<string, ExtractedSource>();
  for (const source of sources) {
    const key = sourceCacheKey(source.canonicalUrl);
    const existing = byCanonical.get(key);
    if (!existing) {
      byCanonical.set(key, source);
      continue;
    }
    if (!existing.fetched && source.fetched) byCanonical.set(key, source);
    else if (existing.wordCount < source.wordCount) byCanonical.set(key, source);
  }

  const kept: ExtractedSource[] = [];
  for (const source of byCanonical.values()) {
    const duplicate = kept.find(
      (candidate) =>
        candidate.domain === source.domain &&
        normaliseTitle(candidate.title) === normaliseTitle(source.title) &&
        candidate.wordCount < 80 &&
        source.wordCount < 80,
    );
    if (!duplicate) kept.push(source);
  }
  return kept;
}

function normaliseTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
