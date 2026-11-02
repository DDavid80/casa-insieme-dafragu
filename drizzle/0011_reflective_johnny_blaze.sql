ALTER TABLE `debts` ADD `initial_paid_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `personal_plans` ADD `initial_saved_cents` integer DEFAULT 0 NOT NULL;