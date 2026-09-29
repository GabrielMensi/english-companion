ALTER TABLE `corrections` ADD `subtype` text;--> statement-breakpoint
ALTER TABLE `corrections` ADD `tense` text;--> statement-breakpoint
ALTER TABLE `corrections` ADD `tense_used` text;--> statement-breakpoint
ALTER TABLE `corrections` ADD `classification` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `corrections` ADD `classified_by` text;--> statement-breakpoint
ALTER TABLE `corrections` ADD `classification_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `corrections_classification_idx` ON `corrections` (`classification`);