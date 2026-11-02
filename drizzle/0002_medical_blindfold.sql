CREATE TABLE `utility_bills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`movement_id` integer NOT NULL,
	`provider` text NOT NULL,
	`service` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`wallet` text NOT NULL,
	`date` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
