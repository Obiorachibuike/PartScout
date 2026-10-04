import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appConfig } from "@/lib/config";
import { exchangeGoogleCode, googleRedirectUri, isGoogleConfigured } from "@/lib/auth/google";
import { findOrCreateGoogleUser } from "@/lib/auth/accounts";
import { createSessionToken, generateCsrfToken, setSessionCookies } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "ps_oauth_state";

/** GET /api/auth/google/callback — completes Google sign-in. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/profile?error=${encodeURIComponent(reason)}`, appConfig.appUrl));

  if (!isGoogleConfigured()) return fail("google_not_configured");
  if (!code || !state || !expectedState || state !== expectedState) return fail("invalid_oauth_state");

  const profile = await exchangeGoogleCode({ code, redirectUri: googleRedirectUri(appConfig.appUrl) });
  if (!profile?.email) return fail("google_sign_in_failed");

  const user = await findOrCreateGoogleUser({
    providerAccountId: profile.sub,
    email: profile.email,
    name: profile.name ?? null,
    image: profile.picture ?? null,
  });
  if (!user) return fail("no_database");

  const token = await createSessionToken(user);
  await setSessionCookies(token, generateCsrfToken());
  logger.info("google sign-in completed", { userId: user.id });
  return NextResponse.redirect(new URL("/history", appConfig.appUrl));
}
