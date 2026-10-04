import { jsonError, jsonOk, noStoreHeaders, parseJsonBody } from "@/lib/api/respond";
import { UnauthorizedError } from "@/lib/errors";
import { loginSchema } from "@/lib/validation/schemas";
import { authenticateWithPassword } from "@/lib/auth/accounts";
import { createSessionToken, generateCsrfToken, setSessionCookies } from "@/lib/auth/session";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    checkRateLimit({
      key: `login:${clientIp(request)}`,
      limit: 20,
      windowMs: 15 * 60 * 1000,
      throwOnLimit: true,
      message: "Too many sign-in attempts. Please wait a few minutes and try again.",
    });

    const body = await parseJsonBody(request, loginSchema);
    const user = await authenticateWithPassword(body.email, body.password);
    if (!user) throw new UnauthorizedError("Incorrect email or password");

    const token = await createSessionToken(user);
    const csrf = generateCsrfToken();
    await setSessionCookies(token, csrf);
    return jsonOk({ user, csrfToken: csrf }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
