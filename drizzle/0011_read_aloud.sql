CREATE TABLE `pronunciation_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`expected` text NOT NULL,
	`heard` text NOT NULL,
	`category` text NOT NULL,
	`detail` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `read_aloud_attempts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pronunciation_issues_attempt_idx` ON `pronunciation_issues` (`attempt_id`);--> statement-breakpoint
CREATE INDEX `pronunciation_issues_created_idx` ON `pronunciation_issues` (`created_at`);--> statement-breakpoint
CREATE TABLE `read_aloud_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_id` text,
	`focus` text,
	`text` text NOT NULL,
	`transcript` text NOT NULL,
	`correct_words` integer NOT NULL,
	`total_words` integer NOT NULL,
	`audio_duration_ms` integer,
	`transcription_provider` text,
	`transcription_model` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `read_aloud_attempts_created_idx` ON `read_aloud_attempts` (`created_at`);