import { searchConfig } from "@/lib/config";
import { ProviderNotConfiguredError, SearchFailedError } from "@/lib/errors";
import { fetchJson } from "@/lib/providers/http";
import { type SearchProvider, normaliseResults } from "@/lib/providers/search/SearchProvider";
import type { SearchOptions, SearchResult } from "@/types/research";

interface TavilyResponse {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    raw_content?: string | null;
    score?: number;
    published_date?: string;
  }>;
}

/**
 * Tavily — https://docs.tavily.com/documentation/api-reference/endpoint/search
 * `include_raw_content` gives us cleaned page text, which often removes the need
 * to fetch the page ourselves.
 */
export class TavilySearchProvider implements SearchProvider {
  readonly id = "tavily";
  readonly returnsContent = true;
  readonly maxResults = 20;

  isConfigured(): boolean {
    return Boolean(searchConfig.tavily.apiKey);
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError("TAVILY_API_KEY is not configured", [
        "Set TAVILY_API_KEY in your environment, or choose another SEARCH_PROVIDER.",
      ]);
    }
    const limit = Math.min(options.limit ?? 8, this.maxResults);

    const payload = await fetchJson<TavilyResponse>("https://api.tavily.com/search", {
      method: "POST",
      label: "tavily.search",
      timeoutMs: 20_000,
      signal: options.signal,
      headers: { authorization: `Bearer ${searchConfig.tavily.apiKey}` },
      body: {
        query,
        search_depth: searchConfig.tavily.searchDepth,
        max_results: limit,
        include_answer: false,
        include_raw_content: true,
        include_images: false,
        ...(options.includeDomains?.length ? { include_domains: options.includeDomains } : {}),
        ...(options.excludeDomains?.length ? { exclude_domains: options.excludeDomains } : {}),
        ...(options.recencyDays ? { days: options.recencyDays } : {}),
      },
    }).catch((error) => {
      throw new SearchFailedError(`Tavily search failed: ${error instanceof Error ? error.message : "unknown error"}`, {
        cause: error,
      });
    });

    return normaliseResults(
      (payload.results ?? [])
        .filter((item): item is NonNullable<typeof item> & { url: string } => Boolean(item.url))
        .map((item) => ({
          title: item.title ?? item.url,
          url: item.url,
          snippet: item.content ?? "",
          rawContent: item.raw_content ?? undefined,
          score: item.score,
          publishedAt: item.published_date,
        })),
      { provider: this.id, query, limit },
    );
  }
}
