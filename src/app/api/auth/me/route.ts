import { getCapabilities } from "@/lib/config";
import { jsonOk, noStoreHeaders } from "@/lib/api/respond";
import { getSession, isAuthConfigured } from "@/lib/auth/session";
import { isGoogleConfigured } from "@/lib/auth/google";
import { isDatabaseConfigured } from "@/lib/db/client";
import { getAIProvider } from "@/lib/providers/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/auth/me — session + capability snapshot used by client components. */
export async function GET() {
  const session = await getSession();
  const capabilities = getCapabilities();
  const ai = getAIProvider();

  return jsonOk(
    {
      user: session,
      capabilities: {
        ...capabilities,
        authConfigured: isAuthConfigured(),
        googleEnabled: isGoogleConfigured(),
        databaseConfigured: isDatabaseConfigured(),
        visionConfigured: Boolean(ai?.supportsVision),
      },
    },
    { headers: noStoreHeaders() },
  );
}
