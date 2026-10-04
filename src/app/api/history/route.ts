import { jsonError, jsonOk, noStoreHeaders } from "@/lib/api/respond";
import { UnauthorizedError } from "@/lib/errors";
import { getSessionFromRequest } from "@/lib/auth/session";
import { listIdentificationsForUser, listResearchForUser } from "@/lib/db/research-repository";
import { isDatabaseConfigured } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/history — the signed-in user's research history + identifications. */
export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) throw new UnauthorizedError("Sign in to view your research history");
    if (!isDatabaseConfigured()) {
      return jsonOk(
        { research: [], identifications: [], persistenceEnabled: false },
        { headers: noStoreHeaders() },
      );
    }

    const url = new URL(request.url);
    const search = url.searchParams.get("q")?.slice(0, 120) ?? undefined;
    const take = Math.min(Number(url.searchParams.get("take") ?? 25) || 25, 100);
    const skip = Math.max(Number(url.searchParams.get("skip") ?? 0) || 0, 0);

    const [research, identifications] = await Promise.all([
      listResearchForUser(session.id, { search, take, skip }),
      listIdentificationsForUser(session.id, 10),
    ]);

    return jsonOk({ research, identifications, persistenceEnabled: true }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
