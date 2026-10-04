import { type SearchProviderId, fixturesAllowed, isSearchProviderReady, searchConfig } from "@/lib/config";
import { ProviderNotConfiguredError } from "@/lib/errors";
import { BraveSearchProvider } from "@/lib/providers/search/BraveSearchProvider";
import { ExaSearchProvider } from "@/lib/providers/search/ExaSearchProvider";
import { FixtureSearchProvider } from "@/lib/providers/search/FixtureSearchProvider";
import { SerperSearchProvider } from "@/lib/providers/search/SerperSearchProvider";
import { TavilySearchProvider } from "@/lib/providers/search/TavilySearchProvider";
import { SEARCH_PROVIDER_DESCRIPTORS } from "@/lib/providers/search/SearchProvider";
import type { SearchProvider } from "@/lib/providers/search/SearchProvider";

/**
 * Search provider registry — the only place that knows about concrete vendors.
 * `SEARCH_PROVIDER` selects the implementation; business logic depends on the
 * `SearchProvider` interface alone.
 */
const registry: Record<SearchProviderId, () => SearchProvider> = {
  tavily: () => new TavilySearchProvider(),
  exa: () => new ExaSearchProvider(),
  serper: () => new SerperSearchProvider(),
  brave: () => new BraveSearchProvider(),
  fixture: () => new FixtureSearchProvider(),
};

export function createSearchProvider(id: SearchProviderId): SearchProvider {
  const factory = registry[id];
  if (!factory) {
    throw new ProviderNotConfiguredError(`Unknown search provider "${id}"`, [
      `Supported providers: ${Object.keys(registry).join(", ")}`,
    ]);
  }
  return factory();
}

/** The primary configured provider. Throws when nothing usable is configured. */
export function getSearchProvider(): SearchProvider {
  const id = searchConfig.providerId;
  if (!id) {
    throw new ProviderNotConfiguredError(
      `SEARCH_PROVIDER "${searchConfig.configuredRawValue || "(empty)"}" is not supported`,
      [`Set SEARCH_PROVIDER to one of: ${Object.keys(registry).join(", ")}`],
    );
  }
  const provider = createSearchProvider(id);
  if (!provider.isConfigured()) {
    throw new ProviderNotConfiguredError(
      `Search provider "${id}" is not configured`,
      [
        `Set the API key for ${id} (see .env.example), or switch SEARCH_PROVIDER to a provider you have a key for.`,
      ],
    );
  }
  return provider;
}

/**
 * Providers actually used for a research run: the primary plus an optional
 * secondary (`SEARCH_FALLBACK_PROVIDER`) whose results are merged and deduped.
 */
export function getSearchProviders(): SearchProvider[] {
  const providers: SearchProvider[] = [getSearchProvider()];
  const fallbackId = searchConfig.fallbackProviderId;
  if (fallbackId && fallbackId !== searchConfig.providerId) {
    try {
      const fallback = createSearchProvider(fallbackId);
      if (fallback.isConfigured()) providers.push(fallback);
    } catch {
      // A broken optional fallback must never break research.
    }
  }
  return providers;
}

export function getSearchProviderIds(): string[] {
  const ids = [searchConfig.providerId].filter(Boolean) as string[];
  if (searchConfig.fallbackProviderId) ids.push(searchConfig.fallbackProviderId);
  return ids;
}

export function describeSearchSetup(): {
  configured: boolean;
  providerId: string | null;
  configuredRaw: string;
  available: Array<{ id: string; label: string; ready: boolean; apiKeyEnvVar: string; notes: string; docsUrl: string }>;
  fixturesEnabled: boolean;
} {
  return {
    configured: isSearchProviderReady(),
    providerId: searchConfig.providerId,
    configuredRaw: searchConfig.configuredRawValue,
    available: SEARCH_PROVIDER_DESCRIPTORS.map((descriptor) => ({
      id: descriptor.id,
      label: descriptor.label,
      ready: createSearchProvider(descriptor.id as SearchProviderId).isConfigured(),
      apiKeyEnvVar: descriptor.apiKeyEnvVar,
      notes: descriptor.notes,
      docsUrl: descriptor.docsUrl,
    })),
    fixturesEnabled: fixturesAllowed,
  };
}

export type { SearchProvider };
