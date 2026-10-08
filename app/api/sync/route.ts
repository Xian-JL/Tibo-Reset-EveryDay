import { getRawDb } from "@/db";
import { synchronize } from "@/lib/sync.mts";

export const dynamic = "force-dynamic";

// Production access is enforced by Sites' owner-private dispatch boundary.
// Unattended callers obtain a service credential from get_site, never from the browser.
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ ok: false, error: "cross_origin_request" }, { status: 403 });
  }
  try {
    const result = await synchronize(getRawDb());
    return Response.json(result, { status: result.ok ? 200 : result.busy ? 409 : 502, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ ok: false, error: "storage_unavailable" }, { status: 503 }); }
}
