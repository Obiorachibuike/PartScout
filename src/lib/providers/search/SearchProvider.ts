import type { SearchOptions, SearchResult } from "@/types/research";

/**
 * Search provider abstraction.
 *
 * PartScout NEVER scrapes Google/Bing/Yahoo result pages. Every provider here is
 * a licensed search/research API, and the whole application only ever talks to
 * this interface, so swapping vendors (or adding a second one) is a config change.
 */
export interface SearchProvider {
  readonly id: string;
  /** Does this provider return page content inline (saves a fetch per page)? */
  readonly returnsContent: boolean;
  /** Documented maximum results per call. */
  readonly maxResults: number;
  /** True when credentials for this provider are present. */
  isConfigured(): boolean;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

export interface ProviderDescriptor {
  id: string;
  label: string;
  /** Env var that must be set for this provider to work. */
  apiKeyEnvVar: string;
  docsUrl: string;
  returnsContent: boolean;
  maxResults: number;
  notes: string;
}

export const SEARCH_PROVIDER_DESCRIPTORS: ProviderDescriptor[] = [
  {
    id: "tavily",
    label: "Tavily",
    apiKeyEnvVar: "TAVILY_API_KEY",
    docsUrl: "https://docs.tavily.com/documentation/api-reference/endpoint/search",
    returnsContent: true,
    maxResults: 20,
    notes: "Search API purpose-built for LLM research; can return cleaned page content.",
  },
  {
    id: "exa",
    label: "Exa",
    apiKeyEnvVar: "EXA_API_KEY",
    docsUrl: "https://docs.exa.ai/reference/search",
    returnsContent: true,
    maxResults: 25,
    notes: "Neural/keyword search with inline text extraction.",
  },
  {
    id: "serper",
    label: "Serper",
    apiKeyEnvVar: "SERPER_API_KEY",
    docsUrl: "https://serper.dev/playground",
    returnsContent: false,
    maxResults: 20,
    notes: "SERP API (Google/Bing results via licence). Metadata only — PartScout fetches pages itself.",
  },
  {
    id: "brave",
    label: "Brave Search",
    apiKeyEnvVar: "BRAVE_SEARCH_API_KEY",
    docsUrl: "https://api-dashboard.search.brave.com/app/documentation/web-search/get-started",
    returnsContent: false,
    maxResults: 20,
    notes: "Independent web index. Metadata only — PartScout fetches pages itself.",
  },
  {
    id: "fixture",
    label: "Fixture (development only)",
    apiKeyEnvVar: "(PARTSCOUT_ALLOW_FIXTURES=true)",
    docsUrl: "https://github.com/Obiorachibuike/PartScout#fixtures",
    returnsContent: true,
    maxResults: 10,
    notes:
      "Synthetic pages used by the automated test-suite. Hard-disabled in production; results are always labelled as fixture data.",
  },
];

export function describeSearchProvider(id: string): ProviderDescriptor | undefined {
  return SEARCH_PROVIDER_DESCRIPTORS.find((descriptor) => descriptor.id === id);
}

/** Shared helper: keep only usable results and attach provider metadata. */
export function normaliseResults(
  raw: Array<Partial<SearchResult> & { url: string }>,
  input: { provider: string; query: string; limit: number },
): SearchResult[] {
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  for (const [index, item] of raw.entries()) {
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const key = url.replace(/[#?].*$/, "").replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: (item.title ?? url).toString().slice(0, 300),
      url,
      snippet: (item.snippet ?? "").toString().slice(0, 1_500),
      provider: input.provider,
      score: typeof item.score === "number" ? item.score : undefined,
      publishedAt: item.publishedAt,
      rawContent: item.rawContent?.toString().slice(0, 80_000),
      query: input.query,
      rank: index + 1,
    });
    if (out.length >= input.limit) break;
  }
  return out;
}
