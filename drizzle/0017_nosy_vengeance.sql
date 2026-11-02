CREATE TABLE `debt_adjustments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`debt_id` integer NOT NULL,
	`previous_residual_cents` integer NOT NULL,
	`new_residual_cents` integer NOT NULL,
	`delta_cents` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`author` text NOT NULL,
	`adjusted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `trips` ADD `active` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `completed_at` text;