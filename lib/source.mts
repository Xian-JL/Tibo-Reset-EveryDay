export const SOURCE_PAGE = "https://codex-resets.com/zh-CN";
export const ENGLISH_API = "https://codex-resets.com/api/v1/resets";
export const CHINESE_API = "https://codex-resets.com/api/resets?locale=zh-CN";

export interface Message {
  id: string;
  originalUrl: string;
  messageAt: string;
  timeKind: "published" | "observed";
  textEn: string;
  textZh: string | null;
  isResetMention: boolean;
  contentIncomplete: boolean;
  resetType: string;
}
export interface Collection { messages: Message[]; warning: string | null; }
type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};
}
function string(value: unknown): string | null { return typeof value === "string" && value.trim() ? value : null; }

export class SourceError extends Error {
  code: string;
  constructor(code: string) { super(code); this.name = "SourceError"; this.code = code; }
}

export function originalPost(value: unknown): { id: string; url: string } | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/thsottiaux\/status\/(\d+)\/?$/i);
    return match ? { id: match[1], url: `https://x.com/thsottiaux/status/${match[1]}` } : null;
  } catch { return null; }
}

// Announcements have already been selected for quota relevance by the source.
// Explicit software/password resets must not become quota highlights.
export function mentionsReset(text: string): boolean {
  const withoutUrls = text.replace(/https?:\/\/\S+/g, "");
  const reset = /\b(?:reset|resets|resetting|reseting|resetted|reseted)\b/i;
  if (!reset.test(withoutUrls)) return false;
  const quota = /\b(?:usage|quota|limits?|allowance|banked|credits?|subscriptions?|accounts?|users?)\b/i;
  const unrelated = /\breset(?:s|ting)?\s+(?:(?:the|my|your|a)\s+)?(?:password|branch|repository|repo|git|code|server|database|settings|cache)\b|\bgit\s+reset\b/i;
  return !unrelated.test(withoutUrls) || quota.test(withoutUrls);
}

export function looksIncomplete(text: string): boolean {
  const body = text.replace(/https?:\/\/\S+/g, "").trim();
  return /(?:…|\.\.\.)\s*$/.test(body) || /\b(?:has been|will be|for your own|we have|and we|because|but|that|which)\s*$/i.test(body);
}

export function parseEnglish(payload: unknown): { messages: Message[]; nextCursor: string | null } {
  const root = object(payload);
  if (!Array.isArray(root.data)) throw new SourceError("invalid_english_payload");
  const messages: Message[] = [];
  for (const item of root.data) {
    const row = object(item);
    const source = object(row.source);
    const post = originalPost(source.url);
    const text = string(row.text);
    const timestamp = string(row.announced_at);
    if (!post || !text || !timestamp || !Number.isFinite(Date.parse(timestamp))) continue;
    if (source.author && source.author !== "thsottiaux") continue;
    messages.push({
      id: post.id, originalUrl: post.url, messageAt: new Date(timestamp).toISOString(),
      timeKind: source.type === "observed" ? "observed" : "published",
      textEn: text, textZh: null, isResetMention: mentionsReset(text),
      contentIncomplete: looksIncomplete(text), resetType: string(row.reset_type) ?? "unknown",
    });
  }
  const pagination = object(root.pagination);
  return { messages, nextCursor: pagination.has_more === true ? string(pagination.next_cursor) : null };
}

interface Translation { id: string; originalUrl: string; messageAt: string; originalText: string; translatedText: string; }
export function parseChinese(payload: unknown): Map<string, Translation> {
  const root = object(payload);
  if (!Array.isArray(root.events)) throw new SourceError("invalid_chinese_payload");
  const translations = new Map<string, Translation>();
  for (const item of root.events) {
    const row = object(item);
    const post = originalPost(row.tweet_url);
    const timestamp = string(row.announced_at);
    const original = string(row.text);
    const translated = string(row.display_text);
    const recordId = String(row.tweet_id);
    const validRecordId = !!post && (recordId === post.id || /^observed-[\w-]+$/.test(recordId));
    if (!post || !validRecordId || !timestamp || !Number.isFinite(Date.parse(timestamp)) || !original || !translated || translated === original) continue;
    translations.set(post.id, { id: post.id, originalUrl: post.url, messageAt: new Date(timestamp).toISOString(), originalText: original, translatedText: translated });
  }
  return translations;
}

// JSON variants differ in line wrapping; comparison normalizes whitespace only.
// Display and storage retain each source's original text verbatim.
function normalizeText(value: string): string { return value.replace(/\s+/g, " ").trim(); }
export function attachTranslations(messages: Message[], translations: Map<string, Translation>): Message[] {
  return messages.map(message => {
    const match = translations.get(message.id);
    return match && match.originalUrl === message.originalUrl && match.messageAt === message.messageAt &&
      normalizeText(match.originalText) === normalizeText(message.textEn)
      ? { ...message, textZh: match.translatedText } : message;
  });
}

export function latestMessages(messages: Message[]): Message[] {
  const unique = new Map<string, Message>();
  for (const message of messages) if (!unique.has(message.id)) unique.set(message.id, message);
  return [...unique.values()].sort((a, b) => b.messageAt.localeCompare(a.messageAt) || b.id.localeCompare(a.id)).slice(0, 15);
}

async function sourceRequest(url: string, fetcher: typeof fetch): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetcher(url, { signal: AbortSignal.timeout(12_000), headers: { Accept: "application/json, text/html;q=0.8" } });
      if (response.ok) return response;
      if (response.status === 429 || response.status >= 500) {
        if (attempt === 0) {
          const retrySeconds = Number(response.headers.get("Retry-After"));
          // Never hammer a source whose requested backoff exceeds this short task.
          if (response.status === 429 && retrySeconds > 2) throw new SourceError("source_rate_limited");
          await new Promise(resolve => setTimeout(resolve, 400));
          continue;
        }
      }
      throw new SourceError(`source_http_${response.status}`);
    } catch (error) {
      if (error instanceof SourceError) throw error;
      if (attempt === 1) throw new SourceError("source_network_error");
    }
  }
  throw new SourceError("source_unavailable");
}

// Worker-native HTML parsing is a fallback if the site's Chinese JSON changes.
async function translationsFromHtml(messages: Message[], fetcher: typeof fetch): Promise<Message[]> {
  if (typeof HTMLRewriter === "undefined") throw new SourceError("html_parser_unavailable");
  const response = await sourceRequest(SOURCE_PAGE, fetcher);
  const rows = new Map<string, { text: string; url: string | null; timestamp: string | null }>();
  let current: { text: string; url: string | null; timestamp: string | null } | null = null;
  const rewriter = new HTMLRewriter()
    .on(".log-list .log-item", { element(element) {
      current = { text: "", url: null, timestamp: null };
      const id = element.getAttribute("data-tweet-id");
      if (id) rows.set(id, current);
    } })
    .on('.log-item [data-role="tweet-display-text"]', { text(chunk) { if (current) current.text += chunk.text; } })
    .on('.log-item [data-role="absolute-time"]', { element(element) { if (current) current.timestamp = element.getAttribute("data-datetime"); } })
    .on(".log-item .log-item-link", { element(element) { if (current) current.url = element.getAttribute("href"); } });
  await rewriter.transform(response).text();
  if (!rows.size) throw new SourceError("invalid_chinese_html");
  return messages.map(message => {
    const row = rows.get(message.id);
    const post = originalPost(row?.url);
    return row && post?.id === message.id && row.timestamp && Date.parse(row.timestamp) === Date.parse(message.messageAt) && row.text.trim()
      ? { ...message, textZh: row.text.trim() } : message;
  });
}

export async function collectMessages(fetcher: typeof fetch = fetch): Promise<Collection> {
  const [englishResult, chineseResult] = await Promise.allSettled([
    sourceRequest(`${ENGLISH_API}?limit=20`, fetcher).then(response => response.json()),
    sourceRequest(CHINESE_API, fetcher).then(response => response.json()),
  ]);
  if (englishResult.status === "rejected") throw englishResult.reason;
  let page = parseEnglish(englishResult.value);
  let messages = page.messages;
  const cursors = new Set<string>();
  while (latestMessages(messages).length < 15 && page.nextCursor && cursors.size < 3) {
    if (cursors.has(page.nextCursor)) throw new SourceError("repeated_source_cursor");
    cursors.add(page.nextCursor);
    const response = await sourceRequest(`${ENGLISH_API}?limit=20&cursor=${encodeURIComponent(page.nextCursor)}`, fetcher);
    page = parseEnglish(await response.json());
    messages = [...messages, ...page.messages];
  }
  messages = latestMessages(messages);
  if (!messages.length) throw new SourceError("empty_source");
  let warning: string | null = null;
  try {
    if (chineseResult.status === "rejected") throw chineseResult.reason;
    messages = attachTranslations(messages, parseChinese(chineseResult.value));
  } catch {
    try { messages = await translationsFromHtml(messages, fetcher); }
    catch { warning = "中文来源暂不可用，已有匹配译文会保留，缺失译文将在后续同步时补充。"; }
  }
  return { messages, warning };
}
