import { getRawDb } from "@/db";
import { getSnapshot, unavailableSnapshot } from "@/lib/sync.mts";
import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json({ ...await getSnapshot(getRawDb()), schedulePaused: env.SYNC_SCHEDULE_PAUSED === "true" }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ ...unavailableSnapshot(), schedulePaused: env.SYNC_SCHEDULE_PAUSED === "true" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
