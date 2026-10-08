export type SyncAuthorization = { ok: true } | { ok: false; status: number; error: string };

export async function authorizeSync(request: Request, secret: string | undefined): Promise<SyncAuthorization> {
  // The read-only site can be public; the writer always fails closed without its server secret.
  if (!secret || secret.length < 24) return { ok: false, status: 503, error: "sync_auth_unavailable" };
  const provided = request.headers.get("X-Tibo-Sync-Key");
  if (!provided || provided.length > 4096) return { ok: false, status: 401, error: "unauthorized" };
  const encoder = new TextEncoder();
  const [actual, expected] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(secret)),
  ]);
  const actualBytes = new Uint8Array(actual);
  const expectedBytes = new Uint8Array(expected);
  let difference = 0;
  for (let index = 0; index < expectedBytes.length; index++) difference |= actualBytes[index] ^ expectedBytes[index];
  if (difference !== 0) return { ok: false, status: 401, error: "unauthorized" };
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return { ok: false, status: 403, error: "cross_origin_request" };
  return { ok: true };
}
