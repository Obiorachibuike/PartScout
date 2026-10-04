import { jsonError, jsonOk, noStoreHeaders, parseJsonBody } from "@/lib/api/respond";
import { UnauthorizedError, ValidationError } from "@/lib/errors";
import { getSessionFromRequest, verifyCsrf } from "@/lib/auth/session";
import { updateUserProfile } from "@/lib/auth/accounts";
import { profileSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) throw new UnauthorizedError("Sign in to update your profile");
    if (!verifyCsrf(request)) throw new ValidationError("Missing or invalid CSRF token");

    const body = await parseJsonBody(request, profileSchema);
    const updated = await updateUserProfile(session.id, { name: body.name });
    if (!updated) throw new ValidationError("The database is not configured on this deployment");
    return jsonOk({ user: updated }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
