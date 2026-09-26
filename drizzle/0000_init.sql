CREATE TABLE `corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`original` text NOT NULL,
	`correction` text NOT NULL,
	`category` text NOT NULL,
	`subcategory` text NOT NULL,
	`severity` text NOT NULL,
	`explanation` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `corrections_message_idx` ON `corrections` (`message_id`);--> statement-breakpoint
CREATE INDEX `corrections_created_idx` ON `corrections` (`created_at`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`reply_to_id` text,
	`content` text NOT NULL,
	`status` text DEFAULT 'done' NOT NULL,
	`error_message` text,
	`corrected_text` text,
	`natural_text` text,
	`improved_prompt` text,
	`word_count` integer DEFAULT 0 NOT NULL,
	`provider` text,
	`model` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reply_to_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_session_idx` ON `messages` (`session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT 'Nuevo chat' NOT NULL,
	`mode` text DEFAULT 'correction' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vocabulary` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`spanish` text NOT NULL,
	`english` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vocabulary_created_idx` ON `vocabulary` (`created_at`);