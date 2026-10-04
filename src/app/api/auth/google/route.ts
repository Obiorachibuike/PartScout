import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appConfig, isProduction } from "@/lib/config";
import { buildGoogleAuthUrl, googleRedirectUri, isGoogleConfigured } from "@/lib/auth/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_COOKIE = "ps_oauth_state";

/** GET /api/auth/google — starts the Google OAuth flow. */
export async function GET() {
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "provider_not_configured",
          message: "Google sign-in is not configured on this deployment.",
          remediation: ["Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Google sign-in."],
          retryable: false,
        },
      },
      { status: 503 },
    );
  }

  const state = randomBytes(16).toString("base64url");
  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: 600,
  });

  const url = buildGoogleAuthUrl({ state, redirectUri: googleRedirectUri(appConfig.appUrl) });
  return NextResponse.redirect(url);
}
