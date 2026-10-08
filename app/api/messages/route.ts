import { getRawDb } from "@/db";
import { getSnapshot, unavailableSnapshot } from "@/lib/sync.mts";

export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json(await getSnapshot(getRawDb()), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json(unavailableSnapshot(), { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
