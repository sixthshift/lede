CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text,
	`role` text,
	`job_description` text NOT NULL,
	`context` text,
	`current` text,
	`locked` text,
	`gen_state` text DEFAULT 'untailored' NOT NULL,
	`current_meta` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
