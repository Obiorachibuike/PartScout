import { authConfig } from "@/lib/config";
import { logger } from "@/lib/logger";

/**
 * Minimal Google OAuth 2.0 (authorisation code) flow — no framework dependency.
 * Enabled only when GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are configured.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export function isGoogleConfigured(): boolean {
  return Boolean(authConfig.google.clientId && authConfig.google.clientSecret);
}

export function googleRedirectUri(appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/auth/google/callback`;
}

export function buildGoogleAuthUrl(input: { state: string; redirectUri: string }): string {
  const params = new URLSearchParams({
    client_id: authConfig.google.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: input.state,
    access_type: "online",
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

export async function exchangeGoogleCode(input: { code: string; redirectUri: string }): Promise<GoogleProfile | null> {
  if (!isGoogleConfigured()) return null;
  try {
    const tokenResponse = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: input.code,
        client_id: authConfig.google.clientId,
        client_secret: authConfig.google.clientSecret,
        redirect_uri: input.redirectUri,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });
    if (!tokenResponse.ok) {
      logger.warn("google token exchange failed", { status: tokenResponse.status });
      return null;
    }
    const tokens = (await tokenResponse.json()) as { access_token?: string };
    if (!tokens.access_token) return null;

    const profileResponse = await fetch(USERINFO_ENDPOINT, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
      cache: "no-store",
    });
    if (!profileResponse.ok) return null;
    const profile = (await profileResponse.json()) as GoogleProfile;
    if (!profile.email) return null;
    return profile;
  } catch (error) {
    logger.warn("google sign-in failed", {
      error: error instanceof Error ? error.message.slice(0, 200) : String(error),
    });
    return null;
  }
}
