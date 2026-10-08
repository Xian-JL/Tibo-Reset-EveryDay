export const SYNC_INTERVAL_MINUTES = 70;
export const SYNC_INTERVAL_MS = SYNC_INTERVAL_MINUTES * 60_000;
export const SYNC_STALE_AFTER_MS = (SYNC_INTERVAL_MINUTES + 15) * 60_000;
// Kept in step with the cloud task's DTSTART (Asia/Shanghai: 2026-10-08 16:12).
export const SCHEDULE_START_AT = "2026-10-08T08:12:00.000Z";

export function nextSyncAt(now: number): string {
  const start = Date.parse(SCHEDULE_START_AT);
  const intervals = now < start ? 0 : Math.floor((now - start) / SYNC_INTERVAL_MS) + 1;
  return new Date(start + intervals * SYNC_INTERVAL_MS).toISOString();
}
