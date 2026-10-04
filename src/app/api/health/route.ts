import { getCapabilities } from "@/lib/config";
import { jsonOk, noStoreHeaders } from "@/lib/api/respond";
import { isDatabaseAvailable, isDatabaseConfigured } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health — deployment readiness (used by the UI banner + monitoring). */
export async function GET() {
  const databaseConfigured = isDatabaseConfigured();
  const databaseAvailable = databaseConfigured ? await isDatabaseAvailable() : false;
  const capabilities = getCapabilities({ databaseConfigured });

  const status = capabilities.searchConfigured ? (databaseAvailable ? "ok" : "degraded") : "not_configured";

  return jsonOk(
    {
      status,
      capabilities,
      database: { configured: databaseConfigured, available: databaseAvailable },
      time: new Date().toISOString(),
    },
    { headers: noStoreHeaders() },
  );
}
