CREATE TABLE `duplicate_acknowledgements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`duplicate_key` text NOT NULL,
	`author` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `duplicate_acknowledgements_duplicate_key_unique` ON `duplicate_acknowledgements` (`duplicate_key`);