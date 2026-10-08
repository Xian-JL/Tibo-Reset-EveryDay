"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, Link2, RefreshCw, Star, TriangleAlert } from "lucide-react";
import type { Snapshot } from "@/lib/sync.mts";
import { nextSyncAt, SYNC_INTERVAL_MINUTES, SYNC_STALE_AFTER_MS } from "@/lib/schedule.mts";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function formatDate(value: string) { return dateFormatter.format(new Date(value)); }

function EmphasizedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/\S+|备用重置额度|备用额度|使用额度|用量限制|所有付费用户|所有账户|重置卡|重置|\b(?:banked\s+reset|usage\s+limits?|reset(?:ting|s)?|reseting|resetted|reseted)\b)/gi);
  return <>{parts.map((part, index) => index % 2 ? /^https?:\/\//i.test(part) ? <span className="text-url" key={index}>{part}</span> : <mark key={index}>{part}</mark> : part)}</>;
}

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
    (!!snapshot.lastSuccessAt && now - Date.parse(snapshot.lastSuccessAt) > SYNC_STALE_AFTER_MS);
  const statusLabel = snapshot.schedulePaused ? "自动同步已暂停" : delayed ? "同步延迟" : snapshot.status === "running" ? "正在同步" : snapshot.lastSuccessAt ? "同步正常" : "等待首次同步";
  const starredCount = snapshot.messages.filter(message => message.isResetMention).length;

  return (
    <main className="page">
      <header className="page-header">
        <div className="header-top">
          <div className="brand">
            <span className="brand-icon" aria-hidden="true"><RefreshCw size={23} strokeWidth={2.2} /></span>
            <div><p className="account-label">Tibo <span>·</span> @thsottiaux</p><h1>Tibo-<span>Reset</span>-EveryDay</h1></div>
          </div>
          <p className={`sync-status${delayed || snapshot.schedulePaused ? " delayed" : ""}`} aria-live="polite">{delayed || snapshot.schedulePaused ? <TriangleAlert size={15} aria-hidden="true" /> : <CheckCircle2 size={15} aria-hidden="true" />}{statusLabel}</p>
        </div>
        <div className="sync-info">
          <div><span className="sync-label">最近成功同步</span><p>{snapshot.lastSuccessAt ? formatDate(snapshot.lastSuccessAt) : "—"}</p></div>
          {!snapshot.schedulePaused && <div><span className="sync-label">下次计划 <span className="timezone">/ 北京时间</span></span><p>{formatDate(nextSyncAt(now))}</p></div>}
          <div className="cadence"><Clock3 size={16} aria-hidden="true" /><span>{snapshot.schedulePaused ? "计划间隔 " : "每 "}<strong>{SYNC_INTERVAL_MINUTES}</strong>{snapshot.schedulePaused ? " 分钟 · 暂停中" : " 分钟同步"}</span></div>
        </div>
      </header>
      {snapshot.schedulePaused && <p className="notice" role="status">自动同步暂时暂停，以下为最近保存的消息。</p>}
      {delayed && !snapshot.schedulePaused && <p className="notice" role="status">{readFailed ? "暂时无法读取更新，保留当前消息。" : snapshot.lastSuccessAt ? "当前同步有延迟，以下为最近成功获取的消息。" : "数据暂不可用，正在等待下一次同步。"}</p>}
      {snapshot.warning && <p className="notice" role="status">{snapshot.warning}</p>}
      <div className="section-heading"><h2>最近消息</h2><p>{snapshot.messages.length} 条收录 <span>·</span> <Star size={14} aria-hidden="true" /> {starredCount} 条标星</p></div>
      {snapshot.messages.length ? (
        <ol className="messages" aria-label="最近15条重置相关消息">
          {snapshot.messages.map((message, index) => (
            <li key={message.id}>
              <article className={`message${message.isResetMention ? " starred" : ""}${index === 0 ? " latest" : ""}`}>
                <div className="message-meta">
                  <span className="message-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <time dateTime={message.messageAt}>{formatDate(message.messageAt)}</time>
                  {index === 0 && <span className="latest-badge">最新消息</span>}
                  {message.timeKind === "observed" && <span>首次观察时间</span>}
                  {message.isResetMention && <span className="star"><Star size={14} fill="currentColor" aria-hidden="true" />明确提及 reset</span>}
                  {message.resetType === "banked" && <span className="kind">备用重置额度</span>}
                </div>
                <p className={`message-text translation${message.textZh ? "" : " translation-missing"}`} lang="zh-CN">{message.textZh ? <EmphasizedText text={message.textZh} /> : "中文译文暂未提供"}</p>
                <div className="original" lang="en">
                  <span className="original-label" lang="zh-CN"><span className="language-tag" aria-hidden="true">EN</span>英文原文</span>
                  <p className="message-text">{message.textEn}</p>
                </div>
                <div className="message-footer">
                  <a href={message.originalUrl} target="_blank" rel="noopener noreferrer"><Link2 size={15} aria-hidden="true" />查看原帖<span className="sr-only">（在新窗口打开）</span></a>
                  {message.contentIncomplete && <span className="incomplete"><TriangleAlert size={14} aria-hidden="true" />来源内容可能不完整</span>}
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
