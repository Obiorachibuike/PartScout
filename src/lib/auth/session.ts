import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { authConfig, isProduction } from "@/lib/config";
import { randomBytes } from "node:crypto";

/**
 * Session handling.
 *
 * Stateless JWT sessions in an httpOnly, sameSite=lax cookie, signed with
 * AUTH_SECRET (NEXTAUTH_SECRET works too). A separate readable CSRF cookie is
 * issued alongside and must be echoed in the `x-partscout-csrf` header for
 * state-changing requests (double-submit cookie pattern).
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
  plan: "FREE" | "PRO" | "TECHNICIAN";
}

const SESSION_COOKIE = authConfig.cookieName;
const CSRF_COOKIE = authConfig.csrfCookieName;

function secretKey(): Uint8Array {
  const secret = authConfig.secret;
  if (!secret || secret.length < 16) {
    // Development fallback keeps the app runnable; production refuses to sign.
    if (isProduction) {
      throw new Error(
        "AUTH_SECRET (or NEXTAUTH_SECRET) must be set to at least 16 characters in production.",
      );
    }
    return new TextEncoder().encode("partscout-development-only-secret");
  }
  return new TextEncoder().encode(secret);
}

export function isAuthConfigured(): boolean {
  return Boolean(authConfig.secret && authConfig.secret.length >= 16);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("partscout")
    .setAudience("partscout-web")
    .setExpirationTime(`${authConfig.sessionDays}d`)
    .sign(secretKey());
}

export async function readSessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: "partscout",
      audience: "partscout-web",
    });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return {
      id: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : null,
      role: payload.role === "ADMIN" ? "ADMIN" : "USER",
      plan: payload.plan === "PRO" ? "PRO" : payload.plan === "TECHNICIAN" ? "TECHNICIAN" : "FREE",
    };
  } catch {
    return null;
  }
}

export function generateCsrfToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Sets the session + CSRF cookies (route handlers only). */
export async function setSessionCookies(token: string, csrfToken: string): Promise<void> {
  const store = await cookies();
  const maxAge = authConfig.sessionDays * 24 * 60 * 60;
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge,
  });
  store.set(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge,
  });
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(CSRF_COOKIE);
}

/** Reads the session from cookies (server components + route handlers). */
export async function getSession(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    return await readSessionToken(store.get(SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}

export async function getSessionFromRequest(request: NextRequest | Request): Promise<SessionUser | null> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return readSessionToken(token ? decodeURIComponent(token) : null);
}

/**
 * Double-submit CSRF check for state-changing API routes. Returns true when the
 * request is safe to process.
 */
export function verifyCsrf(request: Request): boolean {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookieToken = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CSRF_COOKIE}=`))
    ?.slice(CSRF_COOKIE.length + 1);
  const headerToken = request.headers.get("x-partscout-csrf");
  if (!cookieToken || !headerToken) return false;
  if (cookieToken.length !== headerToken.length) return false;
  // Constant-time-ish comparison without extra dependencies.
  let mismatch = 0;
  for (let index = 0; index < cookieToken.length; index += 1) {
    mismatch |= cookieToken.charCodeAt(index) ^ headerToken.charCodeAt(index);
  }
  return mismatch === 0;
}

export function isAdmin(user: SessionUser | null): boolean {
  return Boolean(user && user.role === "ADMIN");
}
