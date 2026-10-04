import bcrypt from "bcryptjs";
import { z } from "zod";

/**
 * Password hashing (bcrypt, cost 12) and strength rules.
 */

const BCRYPT_ROUNDS = 12;

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(200, "Password is too long")
  .refine((value) => /[a-z]/.test(value), "Password must include a lowercase letter")
  .refine((value) => /[A-Z]/.test(value), "Password must include an uppercase letter")
  .refine((value) => /\d/.test(value), "Password must include a number");

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}
