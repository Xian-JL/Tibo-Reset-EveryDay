import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tibo-Reset-EveryDay",
  description: "每30分钟同步 Codex Resets，查看最近15条 Tibo 额度重置消息的中文和英文原文。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
