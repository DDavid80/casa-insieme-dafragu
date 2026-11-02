CREATE TABLE `personal_plan_adjustments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`previous_balance_cents` integer NOT NULL,
	`new_balance_cents` integer NOT NULL,
	`delta_cents` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`author` text NOT NULL,
	`adjusted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
