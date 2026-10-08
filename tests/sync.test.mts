import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { getSnapshot, synchronize } from "../lib/sync.mts";
import { parseEnglish, SourceError } from "../lib/source.mts";

class Statement {
  values: (string | number | null)[] = [];
  readonly database: DatabaseSync;
  readonly sql: string;
  constructor(database: DatabaseSync, sql: string) { this.database = database; this.sql = sql; }
  bind(...values: (string | number | null)[]) { this.values = values; return this; }
  async run() { return this.runNow(); }
  runNow() {
    const stmt = this.database.prepare(this.sql);
    if (/^SELECT/i.test(this.sql.trim())) return { results: stmt.all(...this.values), meta: { changes: 0 } };
    const result = stmt.run(...this.values);
    return { results: [], meta: { changes: Number(result.changes) } };
  }
}

function database() {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync(new URL("../drizzle/", import.meta.url)).filter(name => name.endsWith(".sql"))) {
    sqlite.exec(readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  const adapter = {
    prepare(sql: string) { return new Statement(sqlite, sql); },
    async batch(statements: Statement[]) {
      sqlite.exec("BEGIN");
      try { const result = statements.map(stmt => stmt.runNow()); sqlite.exec("COMMIT"); return result; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  return { db: adapter as unknown as D1Database, sqlite };
}
function messages(count = 20) {
  return parseEnglish({ data: Array.from({ length: count }, (_, index) => ({
    id: String(100 + index), text: "Reset usage limits.", announced_at: new Date(Date.UTC(2026, 9, index + 1)).toISOString(),
    source: { type: "x_post", author: "thsottiaux", url: `https://x.com/thsottiaux/status/${100 + index}` }, reset_type: "regular",
  })) }).messages.map(message => ({ ...message, textZh: "使用额度已重置。" }));
}

test("real SQL keeps fifteen records across repeated runs; source failure preserves data and success time", async () => {
  const { db, sqlite } = database();
  try {
    const data = { messages: messages(), warning: null };
    assert.equal((await synchronize(db, async () => data)).ok, true);
    assert.equal((await synchronize(db, async () => data)).ok, true);
    const before = await getSnapshot(db);
    assert.equal(before.messages.length, 15);
    assert.equal(before.messages[0].id, "119");
    assert.equal((await synchronize(db, async () => { throw new SourceError("source_unavailable"); })).ok, false);
    const after = await getSnapshot(db);
    assert.deepEqual(after.messages, before.messages);
    assert.equal(after.lastSuccessAt, before.lastSuccessAt);
    assert.equal(after.status, "error");
  } finally { sqlite.close(); }
});

test("missing translations retain an unchanged cached translation but invalidate it after an original edit", async () => {
  const { db, sqlite } = database();
  try {
    const data = messages(1);
    await synchronize(db, async () => ({ messages: data, warning: null }));
    await synchronize(db, async () => ({ messages: [{ ...data[0], textZh: null }], warning: "translation unavailable" }));
    assert.equal((await getSnapshot(db)).messages[0].textZh, "使用额度已重置。");
    await synchronize(db, async () => ({ messages: [{ ...data[0], textEn: "Do not reset today.", textZh: null }], warning: null }));
    assert.equal((await getSnapshot(db)).messages[0].textZh, null);
  } finally { sqlite.close(); }
});

test("a failed database write rolls the replacement back and does not stamp a success", async () => {
  const { db, sqlite } = database();
  try {
    const data = messages(1);
    await synchronize(db, async () => ({ messages: data, warning: null }));
    const before = await getSnapshot(db);
    sqlite.exec("CREATE TRIGGER fail_new BEFORE INSERT ON messages BEGIN SELECT RAISE(ABORT, 'test_write_failure'); END");
    assert.equal((await synchronize(db, async () => ({ messages: messages(2), warning: null }))).ok, false);
    const after = await getSnapshot(db);
    assert.deepEqual(after.messages, before.messages);
    assert.equal(after.lastSuccessAt, before.lastSuccessAt);
  } finally { sqlite.close(); }
});

test("concurrent jobs cannot take the same lease; a replaced lease cannot commit stale data", async () => {
  const { db, sqlite } = database();
  try {
    const data = messages(1);
    const result = await synchronize(db, async () => {
      const concurrent = await synchronize(db, async () => ({ messages: data, warning: null }));
      assert.equal(concurrent.busy, true);
      sqlite.exec("UPDATE sync_state SET lease_token='new-owner' WHERE id=1");
      return { messages: data, warning: null };
    });
    assert.equal(result.ok, false);
    assert.equal((await getSnapshot(db)).messages.length, 0);
    assert.equal((await getSnapshot(db)).lastSuccessAt, null);
  } finally { sqlite.close(); }
});
