import { searchConfig } from "@/lib/config";
import { ProviderNotConfiguredError, SearchFailedError } from "@/lib/errors";
import { fetchJson } from "@/lib/providers/http";
import { type SearchProvider, normaliseResults } from "@/lib/providers/search/SearchProvider";
import type { SearchOptions, SearchResult } from "@/types/research";

interface BraveResponse {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
      age?: string;
      page_age?: string | null;
      profile?: { name?: string };
    }>;
  };
}

/**
 * Brave Search — https://api-dashboard.search.brave.com/app/documentation
 * Independent index (not a reseller of Google/Bing), metadata only.
 */
export class BraveSearchProvider implements SearchProvider {
  readonly id = "brave";
  readonly returnsContent = false;
  readonly maxResults = 20;

  isConfigured(): boolean {
    return Boolean(searchConfig.brave.apiKey);
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError("BRAVE_SEARCH_API_KEY is not configured", [
        "Set BRAVE_SEARCH_API_KEY in your environment, or choose another SEARCH_PROVIDER.",
      ]);
    }
    const limit = Math.min(options.limit ?? 8, this.maxResults);
    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(limit, 20)),
      country: searchConfig.brave.country,
      safesearch: "moderate",
      text_decorations: "false",
    });
    if (options.recencyDays) {
      params.set("freshness", options.recencyDays <= 1 ? "pd" : options.recencyDays <= 7 ? "pw" : "pm");
    }

    const payload = await fetchJson<BraveResponse>(
      `https://api.search.brave.com/res/v1/web/search?${params.toString()}`,
      {
        label: "brave.search",
        timeoutMs: 20_000,
        signal: options.signal,
        headers: {
          "x-subscription-token": searchConfig.brave.apiKey,
          accept: "application/json",
        },
      },
    ).catch((error) => {
      throw new SearchFailedError(`Brave search failed: ${error instanceof Error ? error.message : "unknown error"}`, {
        cause: error,
      });
    });

    return normaliseResults(
      (payload.web?.results ?? [])
        .filter((item): item is NonNullable<typeof item> & { url: string } => Boolean(item.url))
        .map((item) => ({
          title: item.title ?? item.url,
          url: item.url,
          snippet: item.description ?? "",
          publishedAt: item.page_age ?? undefined,
        })),
      { provider: this.id, query, limit },
    );
  }
}
