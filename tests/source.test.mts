import test from "node:test";
import assert from "node:assert/strict";
import { attachTranslations, collectMessages, latestMessages, looksIncomplete, mentionsReset, originalPost, parseChinese, parseEnglish } from "../lib/source.mts";
import type { Message } from "../lib/source.mts";

function english(text = "We have reset usage limits.", id = "123", date = "2026-10-08T01:00:00Z") {
  return { id, text, announced_at: date, reset_type: "regular", source: { type: "x_post", author: "thsottiaux", url: `https://x.com/thsottiaux/status/${id}` } };
}

test("highlights explicit quota resets, including negatives and source typos, without marking indirect confirmation", () => {
  for (const text of ["Usage limits have been reset", "No reset for paid users today", "We are reseting usage for everyone", "Enjoy a nice reset everyone.", "Banked resets are available"]) assert.equal(mentionsReset(text), true, text);
  for (const text of ["Confirmed landed across all accounts", "git reset --hard", "Reset your password", "Look: https://example.com/reset"]) assert.equal(mentionsReset(text), false, text);
});

test("rejects wrong authors, unsafe URLs and invalid dates; observed time stays observed", () => {
  const observed = { ...english(), source: { type: "observed", url: "https://x.com/thsottiaux/status/123" } };
  const payload = { data: [observed, { ...english(), source: { url: "https://x.com/other/status/456" } }, english("reset", "789", "bad date")] };
  const parsed = parseEnglish(payload).messages;
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].timeKind, "observed");
  assert.equal(originalPost("https://x.com.evil.test/thsottiaux/status/123"), null);
  assert.equal(originalPost("javascript:alert(1)"), null);
  assert.throws(() => parseEnglish({ results: [] }));
});

test("translations require matching post, original text and timestamp", () => {
  const message = parseEnglish({ data: [english()] }).messages;
  const row = { tweet_id: "123", tweet_url: message[0].originalUrl, text: message[0].textEn, announced_at: message[0].messageAt, display_text: "我们已重置使用额度。" };
  assert.equal(attachTranslations(message, parseChinese({ events: [row] }))[0].textZh, row.display_text);
  assert.equal(attachTranslations(message, parseChinese({ events: [{ ...row, text: "We have\nreset usage limits." }] }))[0].textZh, row.display_text);
  assert.equal(attachTranslations(message, parseChinese({ events: [{ ...row, tweet_id: "observed-20261008T010000Z" }] }))[0].textZh, row.display_text);
  for (const change of [{ text: "A revised announcement" }, { announced_at: "2026-10-07T01:00:00Z" }, { tweet_id: "456" }]) {
    assert.equal(attachTranslations(message, parseChinese({ events: [{ ...row, ...change }] }))[0].textZh, null);
  }
});

test("retains the newest fifteen, deduplicates by original post and does not reorder stars", () => {
  const messages = Array.from({ length: 20 }, (_, index) => parseEnglish({ data: [english(index % 2 ? "Confirmed landed" : "Usage reset", String(100 + index), new Date(Date.UTC(2026, 9, 1 + index)).toISOString())] }).messages[0]);
  const latest = latestMessages([...messages, messages[19]]);
  assert.equal(latest.length, 15);
  assert.equal(latest[0].id, "119");
  assert.equal(latest[0].isResetMention, false);
  assert.equal(latest[14].id, "105");
});

test("flags visibly truncated source text without flagging complete short confirmations", () => {
  assert.equal(looksIncomplete("Therefore ... the reset has been https://t.co/example"), true);
  assert.equal(looksIncomplete("Enjoy a reset, for your own https://t.co/example"), true);
  assert.equal(looksIncomplete("Reset all propagated. Enjoy."), false);
});

test("an English source failure fails synchronization instead of returning an empty list", async () => {
  const fetcher = (async () => new Response("unavailable", { status: 403 })) as typeof fetch;
  await assert.rejects(collectMessages(fetcher), /source_http_403/);
});

test("Chinese failure keeps real English records and reports translation availability", async () => {
  const fetcher = (async (url: string | URL | Request) => String(url).includes("api/v1/resets")
    ? Response.json({ data: [english()] }) : new Response("unavailable", { status: 403 })) as typeof fetch;
  const result = await collectMessages(fetcher);
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].textZh, null);
  assert.ok(result.warning);
});

// Keep a compile-time assertion that parsed payloads expose the shared UI shape.
const _messageShape: Message[] = [];
void _messageShape;
