ALTER TABLE `applications` ADD `motivation` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `letter_current` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `letter_previous` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `letter_gen_state` text DEFAULT 'untailored' NOT NULL;--> statement-breakpoint
ALTER TABLE `applications` ADD `letter_failed_reason` text;
