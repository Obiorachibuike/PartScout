import { jsonError, jsonOk, noStoreHeaders, parseJsonBody } from "@/lib/api/respond";
import { ValidationError } from "@/lib/errors";
import { registerSchema } from "@/lib/validation/schemas";
import { createUser } from "@/lib/auth/accounts";
import { createSessionToken, generateCsrfToken, setSessionCookies } from "@/lib/auth/session";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    checkRateLimit({ key: `register:${clientIp(request)}`, limit: 10, windowMs: 60 * 60 * 1000, throwOnLimit: true });

    const body = await parseJsonBody(request, registerSchema);
    const user = await createUser({ email: body.email, password: body.password, name: body.name ?? null });

    if (!user) {
      throw new ValidationError(
        "Could not create the account. Either the email is already registered or the database is not configured on this deployment.",
      );
    }

    const token = await createSessionToken(user);
    const csrf = generateCsrfToken();
    await setSessionCookies(token, csrf);
    return jsonOk({ user, csrfToken: csrf }, { status: 201, headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
