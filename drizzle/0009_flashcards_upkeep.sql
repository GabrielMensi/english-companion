CREATE TABLE `review_log` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`card_key` text NOT NULL,
	`grade` text NOT NULL,
	`was_new` integer NOT NULL,
	`interval_days` integer NOT NULL,
	`reviewed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `review_log_reviewed_idx` ON `review_log` (`reviewed_at`);--> statement-breakpoint
ALTER TABLE `reviews` ADD `suspended_at` integer;