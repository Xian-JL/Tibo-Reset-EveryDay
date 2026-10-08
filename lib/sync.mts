import { collectMessages, latestMessages, SourceError } from "./source.mts";
import type { Collection, Message } from "./source.mts";

export interface Snapshot {
  messages: Message[];
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  status: "pending" | "running" | "ok" | "error" | "unavailable";
  warning: string | null;
}
export function unavailableSnapshot(): Snapshot {
  return { messages: [], lastSuccessAt: null, lastAttemptAt: null, status: "unavailable", warning: null };
}
interface MessageRow {
  id: string; original_url: string; message_at: string; time_kind: "published" | "observed";
  text_en: string; text_zh: string | null; is_reset_mention: number; content_incomplete: number; reset_type: string;
}
interface StateRow {
  last_success_at: string | null; last_attempt_at: string | null; status: Snapshot["status"];
  warning: string | null; lease_until: number;
}

export async function getSnapshot(db: D1Database): Promise<Snapshot> {
  const [rows, stateRows] = await db.batch([
    db.prepare("SELECT * FROM messages ORDER BY message_at DESC, id DESC LIMIT 15"),
    db.prepare("SELECT * FROM sync_state WHERE id = 1"),
  ]);
  const state = (stateRows.results as unknown as StateRow[])[0];
  const status = state?.status === "running" && state.lease_until < Date.now() ? "error" : state?.status ?? "pending";
  return {
    messages: (rows.results as unknown as MessageRow[]).map(row => ({
      id: row.id, originalUrl: row.original_url, messageAt: row.message_at, timeKind: row.time_kind,
      textEn: row.text_en, textZh: row.text_zh, isResetMention: !!row.is_reset_mention,
      contentIncomplete: !!row.content_incomplete, resetType: row.reset_type,
    })),
    lastSuccessAt: state?.last_success_at ?? null, lastAttemptAt: state?.last_attempt_at ?? null,
    status, warning: state?.warning ?? null,
  };
}

export interface SyncResult {
  ok: boolean; busy?: boolean; error?: string; count?: number;
  lastSuccessAt?: string | null; warning?: string | null;
}
export async function synchronize(db: D1Database, load: () => Promise<Collection> = collectMessages): Promise<SyncResult> {
  const token = crypto.randomUUID();
  const start = Date.now();
  const attemptAt = new Date(start).toISOString();
  const acquired = await db.prepare(`INSERT INTO sync_state (id, last_attempt_at, status, lease_token, lease_until)
    VALUES (1, ?, 'running', ?, ?)
    ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at, status='running',
    lease_token=excluded.lease_token, lease_until=excluded.lease_until
    WHERE sync_state.lease_until < ?`).bind(attemptAt, token, start + 120_000, start).run();
  if (!acquired.meta.changes) return { ok: false, busy: true, error: "sync_in_progress" };
  try {
    const collection = await load();
    if (!collection.messages.length) throw new SourceError("empty_source");
    const previous = await getSnapshot(db);
    const existing = new Map(previous.messages.map(message => [message.id, message]));
    const messages = latestMessages(collection.messages).map(message => {
      const old = existing.get(message.id);
      // A cached translation belongs only to an unchanged original and time.
      return !message.textZh && old?.textEn === message.textEn && old.messageAt === message.messageAt && old.originalUrl === message.originalUrl
        ? { ...message, textZh: old.textZh } : message;
    });
    const finishedAt = new Date().toISOString();
    const fenceTime = Date.now();
    const guard = "EXISTS (SELECT 1 FROM sync_state WHERE id=1 AND lease_token=? AND lease_until>?)";
    const commands = [db.prepare(`DELETE FROM messages WHERE ${guard}`).bind(token, fenceTime)];
    for (const message of messages) {
      commands.push(db.prepare(`INSERT INTO messages
        (id, original_url, message_at, time_kind, text_en, text_zh, is_reset_mention, content_incomplete, reset_type, updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard}`).bind(
        message.id, message.originalUrl, message.messageAt, message.timeKind, message.textEn, message.textZh,
        Number(message.isResetMention), Number(message.contentIncomplete), message.resetType, finishedAt, token, fenceTime,
      ));
    }
    commands.push(db.prepare(`UPDATE sync_state SET last_success_at=?, status='ok', last_error=NULL,
      warning=?, lease_token=NULL, lease_until=0 WHERE id=1 AND lease_token=? AND lease_until>?`)
      .bind(finishedAt, collection.warning, token, fenceTime));
    // D1 batch is transactional: records and the success timestamp commit together.
    const results = await db.batch(commands);
    if (!results.at(-1)?.meta.changes) throw new SourceError("sync_lease_lost");
    const snapshot = await getSnapshot(db);
    return { ok: true, count: snapshot.messages.length, lastSuccessAt: snapshot.lastSuccessAt, warning: snapshot.warning };
  } catch (error) {
    const code = error instanceof SourceError ? error.code : "sync_failed";
    await db.prepare(`UPDATE sync_state SET status='error', last_error=?, lease_token=NULL,
      lease_until=0 WHERE id=1 AND lease_token=?`).bind(code, token).run();
    return { ok: false, busy: false, error: code };
  }
}
