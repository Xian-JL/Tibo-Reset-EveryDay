import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  originalUrl: text("original_url").notNull().unique(),
  messageAt: text("message_at").notNull(),
  timeKind: text("time_kind").notNull(),
  textEn: text("text_en").notNull(),
  textZh: text("text_zh"),
  isResetMention: integer("is_reset_mention", { mode: "boolean" }).notNull(),
  contentIncomplete: integer("content_incomplete", { mode: "boolean" }).notNull(),
  resetType: text("reset_type").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const syncState = sqliteTable("sync_state", {
  id: integer("id").primaryKey(),
  lastAttemptAt: text("last_attempt_at"),
  lastSuccessAt: text("last_success_at"),
  status: text("status").notNull().default("pending"),
  lastError: text("last_error"),
  warning: text("warning"),
  leaseToken: text("lease_token"),
  leaseUntil: integer("lease_until").notNull().default(0),
});
