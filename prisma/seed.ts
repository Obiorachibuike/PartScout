import { randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Prisma seed.
 *
 * PartScout has no compatibility data to seed — that would contradict the whole
 * product. The seed only creates the two things a fresh deployment needs to use
 * the app immediately:
 *
 *   1. a demo user (so you can sign in and see history/saved research behaviour)
 *   2. nothing else — research, cache and feedback rows appear from real use.
 *
 * Run with `npm run db:seed` after `npm run db:deploy`.
 */

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const contents = readFileSync(path, "utf8");
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    const value = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key.trim()] === undefined) process.env[key.trim()] = value;
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), ".env"));

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set — nothing to seed. See .env.example.");
    process.exitCode = 1;
    return;
  }

  const { PrismaClient } = (await import("@prisma/client")) as unknown as {
    PrismaClient: new () => {
      user: {
        findUnique(args: unknown): Promise<unknown>;
        create(args: unknown): Promise<{ id: string; email: string }>;
      };
      $disconnect?: () => Promise<void>;
    };
  };

  const bcrypt = (await import("bcryptjs")) as unknown as {
    default?: { hash(data: string, rounds: number): Promise<string> };
    hash?: (data: string, rounds: number) => Promise<string>;
  };
  const hashPassword = bcrypt.default?.hash ?? bcrypt.hash;
  if (!hashPassword) throw new Error("bcryptjs did not expose a hash function");

  const prisma = new PrismaClient();
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  const email = (process.env.SEED_USER_EMAIL ?? "demo@partscout.local").toLowerCase();
  const password = process.env.SEED_USER_PASSWORD ?? randomBytes(9).toString("base64url");
  const generated = !process.env.SEED_USER_PASSWORD;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✔ demo user already exists: ${email}`);
  } else {
    const user = await prisma.user.create({
      data: {
        email,
        name: "PartScout demo",
        passwordHash: await hashPassword(password, 12),
        role: adminEmails.includes(email) ? "ADMIN" : "USER",
        plan: "FREE",
        emailVerified: null,
      },
    });
    console.log(`✔ created demo user ${user.email}`);
    if (generated) console.log(`  generated password: ${password}`);
    console.log("  change it from /profile after your first sign-in");
  }

  console.log("ℹ no compatibility data is seeded — PartScout researches the live web at request time.");
  await prisma.$disconnect?.();
}

main().catch((error) => {
  console.error("seed failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
