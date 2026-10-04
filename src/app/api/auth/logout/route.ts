import { jsonError, jsonOk, noStoreHeaders } from "@/lib/api/respond";
import { ValidationError } from "@/lib/errors";
import { clearSessionCookies, verifyCsrf } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!verifyCsrf(request)) throw new ValidationError("Missing or invalid CSRF token");
    await clearSessionCookies();
    return jsonOk({ signedOut: true }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
