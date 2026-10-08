import { getRawDb } from "@/db";
import { synchronize } from "@/lib/sync.mts";
import { env } from "cloudflare:workers";
import { authorizeSync } from "@/lib/sync-auth.mts";

export const dynamic = "force-dynamic";

// The application checks its own writer credential even when the site is public.
// Only trusted unattended callers obtain the key; browser bundles never receive it.
export async function POST(request: Request) {
  const authorization = await authorizeSync(request, env.SYNC_AUTH_SECRET);
  if (!authorization.ok) return Response.json({ ok: false, error: authorization.error }, {
    status: authorization.status, headers: { "Cache-Control": "no-store" },
  });
  try {
    const result = await synchronize(getRawDb());
    return Response.json(result, { status: result.ok ? 200 : result.busy ? 409 : 502, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ ok: false, error: "storage_unavailable" }, { status: 503 }); }
}
