CREATE TABLE `user_settings` (
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`user_id`, `key`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP INDEX `reviews_card_idx`;--> statement-breakpoint
ALTER TABLE `reviews` ADD `user_id` text REFERENCES `user`(`id`) ON DELETE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX `reviews_user_card_idx` ON `reviews` (`user_id`,`kind`,`card_key`);--> statement-breakpoint
ALTER TABLE `corrections` ADD `user_id` text REFERENCES `user`(`id`) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `corrections_user_idx` ON `corrections` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `corrections_user_classification_idx` ON `corrections` (`user_id`,`classification`);--> statement-breakpoint
ALTER TABLE `messages` ADD `user_id` text REFERENCES `user`(`id`) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `messages_user_idx` ON `messages` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `missed_exercises` ADD `user_id` text REFERENCES `user`(`id`) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `pronunciation_issues` ADD `user_id` text REFERENCES `user`(`id`) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `pronunciation_issues_user_idx` ON `pronunciation_issues` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `read_aloud_attempts` ADD `user_id` text REFERENCES `user`(`id`) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `read_aloud_attempts_user_idx` ON `read_aloud_attempts` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `review_log` ADD `user_id` text REFERENCES `user`(`id`) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `review_log_user_idx` ON `review_log` (`user_id`,`reviewed_at`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `user_id` text REFERENCES `user`(`id`) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`,`updated_at`);--> statement-breakpoint
ALTER TABLE `vocabulary` ADD `user_id` text REFERENCES `user`(`id`) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `vocabulary_user_idx` ON `vocabulary` (`user_id`,`created_at`);