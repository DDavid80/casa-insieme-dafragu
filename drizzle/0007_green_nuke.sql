PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text DEFAULT 'Casa Insieme' NOT NULL,
	`common_accounts` text DEFAULT '["N26","BBVA Dafragu","BBVA Utenze","Ticket Satispay"]' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_settings`("id", "title", "common_accounts", "updated_at") SELECT "id", "title", "common_accounts", "updated_at" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `deadlines` ADD `completed` integer DEFAULT false NOT NULL;