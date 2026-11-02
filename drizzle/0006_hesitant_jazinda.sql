CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`author` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `goal_contributions` ADD `source_movement_id` integer;--> statement-breakpoint
ALTER TABLE `goals` ADD `photo_key` text;--> statement-breakpoint
ALTER TABLE `settings` ADD `common_accounts` text DEFAULT '["N26","BBVA Dafragu","BBVA Utenze"]' NOT NULL;