import { appConfig } from "@/lib/config";
import { withDb, getDatabaseClient, isDatabaseAvailable } from "@/lib/db/client";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { SessionUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

/**
 * User accounts. PartScout works without a database (research is anonymous), so
 * every function here returns null/false instead of throwing when persistence is
 * unavailable — the UI then explains that accounts need DATABASE_URL.
 */

export interface CreateUserInput {
  email: string;
  password?: string | null;
  name?: string | null;
  google?: { providerAccountId: string } | null;
}

export async function createUser(input: CreateUserInput): Promise<SessionUser | null> {
  const email = input.email.trim().toLowerCase();
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  const role = appConfig.adminEmails.includes(email) ? "ADMIN" : "USER";

  const created = await withDb(async (client) => {
    const existing = await client.user.findUnique({ where: { email } });
    if (existing) return null;

    const user = await client.user.create({
      data: {
        email,
        name: input.name ?? email.split("@")[0]!,
        passwordHash,
        role,
        plan: "FREE",
      },
    });

    if (input.google) {
      await client.account.create({
        data: {
          userId: user.id,
          provider: "google",
          providerAccountId: input.google.providerAccountId,
        },
      });
    }

    return { id: user.id, email: user.email, name: user.name, role: user.role, plan: user.plan };
  });

  return created ?? null;
}

export async function authenticateWithPassword(email: string, password: string): Promise<SessionUser | null> {
  const normalized = email.trim().toLowerCase();
  const result = await withDb(async (client) => {
    const user = await client.user.findUnique({ where: { email: normalized } });
    if (!user) return null;
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return null;
    return { id: user.id, email: user.email, name: user.name, role: user.role, plan: user.plan } satisfies SessionUser;
  });
  return result ?? null;
}

export async function findOrCreateGoogleUser(input: {
  providerAccountId: string;
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<SessionUser | null> {
  const email = input.email.trim().toLowerCase();
  const result = await withDb(async (client) => {
    const account = await client.account.findUnique({
      where: { provider_providerAccountId: { provider: "google", providerAccountId: input.providerAccountId } },
    });
    if (account) {
      const user = await client.user.findUnique({ where: { id: account.userId } });
      if (user) {
        return { id: user.id, email: user.email, name: user.name, role: user.role, plan: user.plan } satisfies SessionUser;
      }
    }

    const existing = await client.user.findUnique({ where: { email } });
    if (existing) {
      await client.account
        .create({
          data: { userId: existing.id, provider: "google", providerAccountId: input.providerAccountId },
        })
        .catch(() => undefined);
      return {
        id: existing.id,
        email: existing.email,
        name: existing.name,
        role: existing.role,
        plan: existing.plan,
      } satisfies SessionUser;
    }

    const role = appConfig.adminEmails.includes(email) ? "ADMIN" : "USER";
    const user = await client.user.create({
      data: {
        email,
        name: input.name ?? email.split("@")[0]!,
        image: input.image ?? null,
        role,
        plan: "FREE",
      },
    });
    await client.account.create({
      data: { userId: user.id, provider: "google", providerAccountId: input.providerAccountId },
    });
    return { id: user.id, email: user.email, name: user.name, role: user.role, plan: user.plan } satisfies SessionUser;
  });
  return result ?? null;
}

export async function findUserByEmail(email: string) {
  return withDb(async (client) => client.user.findUnique({ where: { email: email.trim().toLowerCase() } }));
}

export async function accountsAvailable(): Promise<boolean> {
  return Boolean(getDatabaseClient()) && (await isDatabaseAvailable());
}

export async function updateUserProfile(
  userId: string,
  data: { name?: string | null; image?: string | null },
): Promise<boolean> {
  const result = await withDb(async (client) => {
    await client.user.update({ where: { id: userId }, data });
    return true;
  });
  if (!result) logger.warn("profile update skipped (no database)");
  return Boolean(result);
}
