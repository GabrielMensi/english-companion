CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`card_key` text NOT NULL,
	`ease` real NOT NULL,
	`interval_days` integer DEFAULT 0 NOT NULL,
	`repetitions` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`due_at` integer NOT NULL,
	`review_count` integer DEFAULT 0 NOT NULL,
	`last_grade` text,
	`last_reviewed_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_card_idx` ON `reviews` (`kind`,`card_key`);--> statement-breakpoint
CREATE INDEX `reviews_due_idx` ON `reviews` (`due_at`);