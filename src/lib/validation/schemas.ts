import { z } from "zod";
import { PART_CATEGORIES } from "@/types/research";

/** Every input that reaches the pipeline is validated with Zod first. */

const trimmed = (max: number, min = 0) =>
  z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length >= min, { message: `Must be at least ${min} character(s)` })
    .refine((value) => value.length <= max, { message: `Must be at most ${max} characters` });

export const researchModeSchema = z.enum(["auto", "phone", "part", "compatibility", "identify"]);

export const researchRequestSchema = z
  .object({
    question: trimmed(500, 3).optional(),
    device: trimmed(120).optional(),
    modelNumber: trimmed(60).optional(),
    part: trimmed(120).optional(),
    partNumber: trimmed(60).optional(),
    mode: researchModeSchema.default("auto"),
    forceRefresh: z.boolean().optional().default(false),
  })
  .refine(
    (value) => Boolean(value.question) || Boolean(value.device) || Boolean(value.partNumber) || Boolean(value.part),
    {
      message: "Provide a question or at least one of device / part / part number",
      path: ["question"],
    },
  );

export type ResearchRequest = z.infer<typeof researchRequestSchema>;

export const refreshRequestSchema = z.object({
  cacheKey: trimmed(128, 8),
});

export const feedbackSchema = z.object({
  researchId: trimmed(64).optional().nullable(),
  helpful: z.boolean(),
  reason: z
    .enum(["wrong_phone", "wrong_part", "wrong_compatibility", "poor_source", "insufficient_evidence", "other"])
    .optional()
    .nullable(),
  comment: trimmed(1_000).optional().nullable(),
});

export const savedSearchSchema = z.object({
  label: trimmed(200, 1),
  query: trimmed(500, 3),
  mode: researchModeSchema.default("auto"),
  researchId: trimmed(64).optional().nullable(),
});

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
  password: z.string().min(10, "Password must be at least 10 characters").max(200),
  name: trimmed(120).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
  password: z.string().min(1, "Enter your password").max(200),
});

export const profileSchema = z.object({
  name: trimmed(120, 1),
});

export const identifyRequestSchema = z.object({
  hint: trimmed(200).optional().nullable(),
  runResearch: z.boolean().optional().default(true),
  /** Optional user correction of the detected identifier before research. */
  identifierOverride: trimmed(80).optional().nullable(),
});

export const adminMetricsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
});

export const partCategorySchema = z.enum(PART_CATEGORIES);

export const searchPreviewSchema = z.object({
  question: trimmed(500, 3),
  mode: researchModeSchema.default("auto"),
});

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

/** Validates an uploaded part photo (type + size) before any AI call. */
export function validateUpload(input: {
  mimeType: string;
  byteLength: number;
  maxBytes: number;
}): { ok: true } | { ok: false; message: string } {
  const normalized = input.mimeType.toLowerCase().split(";")[0]!.trim();
  if (!ALLOWED_IMAGE_TYPES.includes(normalized as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return {
      ok: false,
      message: `Unsupported image type "${input.mimeType}". Upload a JPEG, PNG, WebP or HEIC photo.`,
    };
  }
  if (input.byteLength <= 0) return { ok: false, message: "The uploaded file is empty." };
  if (input.byteLength > input.maxBytes) {
    return {
      ok: false,
      message: `Image is too large (${(input.byteLength / 1_000_000).toFixed(1)} MB). The limit is ${(
        input.maxBytes / 1_000_000
      ).toFixed(0)} MB.`,
    };
  }
  return { ok: true };
}

/** Magic-byte sniffing so a renamed file cannot smuggle a different type in. */
export function detectImageMimeType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  const bytes = buffer;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  const brand = bytes.subarray(4, 12).toString("ascii");
  if (brand.startsWith("ftypheic") || brand.startsWith("ftypheix") || brand.startsWith("ftypmif1")) return "image/heic";
  return null;
}
