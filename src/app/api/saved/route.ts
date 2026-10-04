import { jsonError, jsonOk, noStoreHeaders, parseJsonBody } from "@/lib/api/respond";
import { UnauthorizedError, ValidationError } from "@/lib/errors";
import { getSessionFromRequest, verifyCsrf } from "@/lib/auth/session";
import { savedSearchSchema } from "@/lib/validation/schemas";
import { deleteSavedSearch, listSavedSearches, saveSearch } from "@/lib/db/research-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) throw new UnauthorizedError("Sign in to view saved searches");
    const saved = await listSavedSearches(session.id);
    return jsonOk({ saved }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) throw new UnauthorizedError("Sign in to save searches");
    if (!verifyCsrf(request)) throw new ValidationError("Missing or invalid CSRF token");

    const body = await parseJsonBody(request, savedSearchSchema);
    const ok = await saveSearch({
      userId: session.id,
      label: body.label,
      query: body.query,
      mode: body.mode,
      researchId: body.researchId ?? null,
    });
    if (!ok) throw new ValidationError("Saving is unavailable: the database is not configured");
    return jsonOk({ saved: true }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) throw new UnauthorizedError("Sign in to manage saved searches");
    if (!verifyCsrf(request)) throw new ValidationError("Missing or invalid CSRF token");

    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new ValidationError("id query parameter is required");
    const removed = await deleteSavedSearch(session.id, id);
    return jsonOk({ removed }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
