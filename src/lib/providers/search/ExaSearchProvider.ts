import { searchConfig } from "@/lib/config";
import { ProviderNotConfiguredError, SearchFailedError } from "@/lib/errors";
import { fetchJson } from "@/lib/providers/http";
import { type SearchProvider, normaliseResults } from "@/lib/providers/search/SearchProvider";
import type { SearchOptions, SearchResult } from "@/types/research";

interface ExaResponse {
  results?: Array<{
    title?: string | null;
    url?: string;
    text?: string | null;
    publishedDate?: string | null;
    score?: number;
    author?: string | null;
  }>;
}

/**
 * Exa — https://docs.exa.ai/reference/search
 * Supports keyword/neural/auto modes and can return page text inline.
 */
export class ExaSearchProvider implements SearchProvider {
  readonly id = "exa";
  readonly returnsContent = true;
  readonly maxResults = 25;

  isConfigured(): boolean {
    return Boolean(searchConfig.exa.apiKey);
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError("EXA_API_KEY is not configured", [
        "Set EXA_API_KEY in your environment, or choose another SEARCH_PROVIDER.",
      ]);
    }
    const limit = Math.min(options.limit ?? 8, this.maxResults);

    const payload = await fetchJson<ExaResponse>("https://api.exa.ai/search", {
      method: "POST",
      label: "exa.search",
      timeoutMs: 20_000,
      signal: options.signal,
      headers: { "x-api-key": searchConfig.exa.apiKey },
      body: {
        query,
        numResults: limit,
        type: searchConfig.exa.mode,
        contents: searchConfig.exa.includeText
          ? { text: { maxCharacters: 12_000 } }
          : undefined,
        ...(options.includeDomains?.length ? { includeDomains: options.includeDomains } : {}),
        ...(options.excludeDomains?.length ? { excludeDomains: options.excludeDomains } : {}),
        ...(options.recencyDays
          ? {
              startPublishedDate: new Date(Date.now() - options.recencyDays * 86_400_000)
                .toISOString()
                .slice(0, 10),
            }
          : {}),
      },
    }).catch((error) => {
      throw new SearchFailedError(`Exa search failed: ${error instanceof Error ? error.message : "unknown error"}`, {
        cause: error,
      });
    });

    return normaliseResults(
      (payload.results ?? [])
        .filter((item): item is NonNullable<typeof item> & { url: string } => Boolean(item.url))
        .map((item) => ({
          title: item.title ?? item.url,
          url: item.url,
          snippet: item.text?.slice(0, 600) ?? "",
          rawContent: item.text ?? undefined,
          score: item.score,
          publishedAt: item.publishedDate ?? undefined,
        })),
      { provider: this.id, query, limit },
    );
  }
}
