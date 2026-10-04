import { searchConfig } from "@/lib/config";
import { ProviderNotConfiguredError, SearchFailedError } from "@/lib/errors";
import { fetchJson } from "@/lib/providers/http";
import { type SearchProvider, normaliseResults } from "@/lib/providers/search/SearchProvider";
import type { SearchOptions, SearchResult } from "@/types/research";

interface SerperResponse {
  organic?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    date?: string;
    position?: number;
  }>;
  knowledgeGraph?: { title?: string; website?: string };
}

/**
 * Serper — https://serper.dev/playground
 * A licensed SERP API. It returns search metadata only (no page bodies), so the
 * extraction stage fetches the pages itself under SSRF guards.
 */
export class SerperSearchProvider implements SearchProvider {
  readonly id = "serper";
  readonly returnsContent = false;
  readonly maxResults = 20;

  isConfigured(): boolean {
    return Boolean(searchConfig.serper.apiKey);
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError("SERPER_API_KEY is not configured", [
        "Set SERPER_API_KEY in your environment, or choose another SEARCH_PROVIDER.",
      ]);
    }
    const limit = Math.min(options.limit ?? 8, this.maxResults);

    const endpoint =
      searchConfig.serper.engine === "bing"
        ? "https://google.serper.dev/bing"
        : "https://google.serper.dev/search";

    const payload = await fetchJson<SerperResponse>(endpoint, {
      method: "POST",
      label: "serper.search",
      timeoutMs: 20_000,
      signal: options.signal,
      headers: { "x-api-key": searchConfig.serper.apiKey },
      body: {
        q: query,
        num: limit,
        ...(options.recencyDays
          ? options.recencyDays <= 1
            ? { tbs: "qdr:d" }
            : options.recencyDays <= 7
              ? { tbs: "qdr:w" }
              : options.recencyDays <= 31
                ? { tbs: "qdr:m" }
                : { tbs: "qdr:y" }
          : {}),
      },
    }).catch((error) => {
      throw new SearchFailedError(`Serper search failed: ${error instanceof Error ? error.message : "unknown error"}`, {
        cause: error,
      });
    });

    return normaliseResults(
      (payload.organic ?? [])
        .filter((item): item is NonNullable<typeof item> & { link: string } => Boolean(item.link))
        .map((item) => ({
          title: item.title ?? item.link,
          url: item.link,
          snippet: item.snippet ?? "",
          publishedAt: item.date,
        })),
      { provider: this.id, query, limit },
    );
  }
}
