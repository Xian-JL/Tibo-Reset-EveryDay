import test from "node:test";
import assert from "node:assert/strict";
import { nextSyncAt } from "../lib/schedule.mts";

test("seventy-minute cadence crosses hours without becoming hourly or half-hourly", () => {
  assert.equal(nextSyncAt(Date.parse("2026-10-08T07:06:00Z")), "2026-10-08T08:12:00.000Z");
  assert.equal(nextSyncAt(Date.parse("2026-10-08T08:12:00Z")), "2026-10-08T09:22:00.000Z");
  assert.equal(nextSyncAt(Date.parse("2026-10-08T09:22:00Z")), "2026-10-08T10:32:00.000Z");
});
