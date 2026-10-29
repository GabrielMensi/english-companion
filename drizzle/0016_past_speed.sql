CREATE TABLE `class_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`held_at` integer NOT NULL,
	`teacher_level` text,
	`notes` text,
	`chat_session_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `class_sessions_user_idx` ON `class_sessions` (`user_id`,`held_at`);--> statement-breakpoint
ALTER TABLE `corrections` ADD `source` text DEFAULT 'ai' NOT NULL;--> statement-breakpoint
ALTER TABLE `vocabulary` ADD `source` text DEFAULT 'app' NOT NULL;