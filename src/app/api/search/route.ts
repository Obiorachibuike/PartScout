import { isSearchProviderReady, limits } from "@/lib/config";
import { jsonError, jsonOk, noStoreHeaders, parseJsonBody } from "@/lib/api/respond";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { getAIProvider } from "@/lib/providers/ai";
import { searchPreviewSchema } from "@/lib/validation/schemas";
import { understandQuery } from "@/lib/research/query-understanding";
import { generateDeterministicQueries } from "@/lib/research/query-generation";
import { listResearchForUser } from "@/lib/db/research-repository";
import { getSessionFromRequest } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/search — query understanding preview.
 *
 * Returns how PartScout interpreted the question (device, part, variant, intent)
 * plus the search queries it will run. Used by the search UI to show the plan
 * before/while researching, and available to API consumers as a dry run.
 */
export async function POST(request: Request) {
  try {
    checkRateLimit({
      key: `preview:${clientIp(request)}`,
      limit: 120,
      windowMs: 60 * 60 * 1000,
      throwOnLimit: true,
    });

    const body = await parseJsonBody(request, searchPreviewSchema);
    const understanding = await understandQuery(body.question, {
      ai: getAIProvider(),
      requestedIntent:
        body.mode === "phone"
          ? "phone_to_parts"
          : body.mode === "part"
            ? "part_to_phones"
            : body.mode === "compatibility"
              ? "compatibility_check"
              : undefined,
    });
    const queries = generateDeterministicQueries(understanding);

    return jsonOk(
      {
        intent: understanding.intent,
        device: understanding.device,
        deviceBrand: understanding.deviceBrand,
        modelNumbers: understanding.modelNumbers,
        variantMarkers: understanding.variantMarkers,
        part: understanding.part,
        partCategory: understanding.partCategory,
        partNumber: understanding.partNumber,
        understandingNotes: understanding.understandingNotes,
        understandingMethod: understanding.understandingMethod,
        queries: queries.map((entry) => ({ query: entry.query, kind: entry.kind, purpose: entry.purpose })),
        searchConfigured: isSearchProviderReady(),
        maxQueriesPerResearch: limits.maxQueriesPerResearch,
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}

/** GET /api/search?q= — matching previous research for the signed-in user. */
export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return jsonOk({ results: [] }, { headers: noStoreHeaders() });
  const query = new URL(request.url).searchParams.get("q")?.slice(0, 120) ?? "";
  const results = await listResearchForUser(session.id, { search: query, take: 8 });
  return jsonOk({ results }, { headers: noStoreHeaders() });
}
