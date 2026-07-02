CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`section` text NOT NULL,
	`meta` text NOT NULL,
	`facts` text NOT NULL,
	`tags` text NOT NULL,
	`framings` text,
	`sort_key` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `profile` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`headline` text,
	`email` text DEFAULT '' NOT NULL,
	`phone` text,
	`location` text,
	`links` text DEFAULT '[]' NOT NULL,
	`base_summary` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT "profile_singleton" CHECK("profile"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `secrets` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`api_key_enc` text,
	`api_key_validated_at` integer,
	`auth` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT "secrets_singleton" CHECK("secrets"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`provider` text DEFAULT 'anthropic' NOT NULL,
	`model` text DEFAULT 'claude-opus-4-8' NOT NULL,
	`base_url` text,
	`layout` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "settings_singleton" CHECK("settings"."id" = 1)
);
