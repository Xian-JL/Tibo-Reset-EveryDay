"use client";

import { useEffect, useState } from "react";
import type { Snapshot } from "@/lib/sync.mts";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function formatDate(value: string) { return dateFormatter.format(new Date(value)); }
function nextSync(now: number) { return new Date((Math.floor(now / 1_800_000) + 1) * 1_800_000).toISOString(); }

export default function MessageList({ initialSnapshot }: { initialSnapshot: Snapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [readFailed, setReadFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const controller = new AbortController();
    async function refresh() {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const response = await fetch("/api/messages", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("read failed");
        const data: Snapshot = await response.json();
        if (active) { setSnapshot(data); setReadFailed(false); }
      } catch {
        if (active && !controller.signal.aborted) setReadFailed(true);
      } finally { inFlight = false; }
    }
    const timer = setInterval(() => { setNow(Date.now()); void refresh(); }, 60_000);
    const onVisible = () => { if (!document.hidden) { setNow(Date.now()); void refresh(); } };
    document.addEventListener("visibilitychange", onVisible);
    void refresh();
    return () => { active = false; controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  const delayed = readFailed || snapshot.status === "error" || snapshot.status === "unavailable" ||
    (!!snapshot.lastSuccessAt && now - Date.parse(snapshot.lastSuccessAt) > 45 * 60_000);
  const statusLabel = delayed ? "同步延迟" : snapshot.status === "running" ? "正在同步" : snapshot.lastSuccessAt ? "同步正常" : "等待首次同步";

  return (
    <main className="page">
      <header className="page-header">
        <h1>Tibo-Reset-EveryDay</h1>
        <div className="sync-info" aria-live="polite">
          <p className={`sync-status${delayed ? " delayed" : ""}`}>{statusLabel}</p>
          <p>最近成功同步：{snapshot.lastSuccessAt ? formatDate(snapshot.lastSuccessAt) : "—"}</p>
          <p>每 30 分钟同步 · 北京时间</p>
          <p>下次计划：{formatDate(nextSync(now))}</p>
        </div>
      </header>
      {delayed && <p className="notice" role="status">{readFailed ? "暂时无法读取更新，保留当前消息。" : snapshot.lastSuccessAt ? "当前同步有延迟，以下为最近成功获取的消息。" : "数据暂不可用，正在等待下一次同步。"}</p>}
      {snapshot.warning && <p className="notice" role="status">{snapshot.warning}</p>}
      {snapshot.messages.length ? (
        <ol className="messages" aria-label="最近15条重置相关消息">
          {snapshot.messages.map(message => (
            <li key={message.id}>
              <article className={`message${message.isResetMention ? " starred" : ""}`}>
                <div className="message-meta">
                  <time dateTime={message.messageAt}>{formatDate(message.messageAt)}</time>
                  {message.timeKind === "observed" && <span>首次观察时间</span>}
                  {message.isResetMention && <span className="star"><span aria-hidden="true">★ </span>明确提及 reset</span>}
                  {message.resetType === "banked" && <span className="kind">备用重置额度</span>}
                </div>
                <p className={`message-text${message.textZh ? "" : " translation-missing"}`} lang="zh-CN">{message.textZh ?? "中文译文暂未提供"}</p>
                <div className="original" lang="en">
                  <span className="original-label" lang="zh-CN">英文原文</span>
                  <p className="message-text">{message.textEn}</p>
                </div>
                <div className="message-footer">
                  <a href={message.originalUrl} target="_blank" rel="noopener noreferrer">查看原帖<span className="sr-only">（在新窗口打开）</span></a>
                  {message.contentIncomplete && <span className="incomplete">来源内容可能不完整</span>}
                </div>
              </article>
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty"><p>{snapshot.status === "unavailable" ? "数据暂不可用" : "暂未获取到消息"}</p><p>首次同步完成后，消息会显示在这里。</p></div>
      )}
      <footer className="page-footer">
        <p>数据来源：<a href="https://codex-resets.com/zh-CN" target="_blank" rel="noopener noreferrer">Codex Resets</a> · 保留最近 {snapshot.messages.length} 条</p>
        <p>仅展示来源已收录的消息。★ 表示明确提及重置，不代表已执行或个人额度到账。</p>
      </footer>
    </main>
  );
}
