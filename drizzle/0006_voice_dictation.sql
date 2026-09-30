ALTER TABLE `messages` ADD `input_mode` text DEFAULT 'typed' NOT NULL;--> statement-breakpoint
ALTER TABLE `messages` ADD `transcript_raw` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `transcript_edited` integer;--> statement-breakpoint
ALTER TABLE `messages` ADD `transcription_provider` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `transcription_model` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `audio_duration_ms` integer;