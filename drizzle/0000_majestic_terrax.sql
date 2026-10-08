CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`original_url` text NOT NULL,
	`message_at` text NOT NULL,
	`time_kind` text NOT NULL,
	`text_en` text NOT NULL,
	`text_zh` text,
	`is_reset_mention` integer NOT NULL,
	`content_incomplete` integer NOT NULL,
	`reset_type` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_original_url_unique` ON `messages` (`original_url`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`last_attempt_at` text,
	`last_success_at` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_error` text,
	`warning` text,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL
);
