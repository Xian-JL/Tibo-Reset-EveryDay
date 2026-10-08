import test from "node:test";
import assert from "node:assert/strict";
import { authorizeSync } from "../lib/sync-auth.mts";

const testSecret = "test-only-sync-credential-not-a-real-secret";
function request(headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/sync", { method: "POST", headers });
}

test("public anonymous and invalid-key callers cannot trigger a write", async () => {
  assert.deepEqual(await authorizeSync(request(), testSecret), { ok: false, status: 401, error: "unauthorized" });
  assert.equal((await authorizeSync(request({ "X-Tibo-Sync-Key": "incorrect-key" }), testSecret)).ok, false);
  assert.equal((await authorizeSync(request({ "oai-authenticated-user-id": "owner", "OAI-Sites-Authorization": `Bearer ${testSecret}` }), testSecret)).ok, false);
});

test("missing server configuration fails closed", async () => {
  assert.deepEqual(await authorizeSync(request({ "X-Tibo-Sync-Key": testSecret }), undefined), { ok: false, status: 503, error: "sync_auth_unavailable" });
});

test("only the expected independent writer header authorizes the job", async () => {
  assert.deepEqual(await authorizeSync(request({ "X-Tibo-Sync-Key": testSecret }), testSecret), { ok: true });
  assert.deepEqual(await authorizeSync(request({ "X-Tibo-Sync-Key": testSecret, Origin: "https://example.test" }), testSecret), { ok: true });
  assert.deepEqual(await authorizeSync(request({ "X-Tibo-Sync-Key": testSecret, Origin: "https://other.test" }), testSecret), { ok: false, status: 403, error: "cross_origin_request" });
});
