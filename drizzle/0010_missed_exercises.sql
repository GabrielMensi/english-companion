CREATE TABLE `missed_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`item_index` integer NOT NULL,
	`topic` text NOT NULL,
	`category` text,
	`subtype` text,
	`tense` text,
	`sentence` text NOT NULL,
	`answer` text NOT NULL,
	`why` text NOT NULL,
	`learner_answer` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `missed_exercises_item_idx` ON `missed_exercises` (`session_id`,`item_index`);