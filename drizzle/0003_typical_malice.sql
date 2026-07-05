ALTER TABLE `applications` ADD `format` text;--> statement-breakpoint
ALTER TABLE `applications` ADD `locked_format` text;--> statement-breakpoint
ALTER TABLE `profile` ADD `photo_url` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `default_format` text DEFAULT '{"templateId":"strict","typography":{"body":{"family":"ibm-plex-sans","size":10,"lineHeight":1.4},"heading":{"family":"ibm-plex-sans","weight":600}},"colors":{"primary":"#1a1a2e","text":"#111111"},"page":{"marginX":40,"marginY":36,"sectionGap":8},"photo":{"hidden":true,"size":64,"shape":"circle"},"sections":{}}' NOT NULL;