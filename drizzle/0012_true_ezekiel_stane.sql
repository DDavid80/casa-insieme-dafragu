ALTER TABLE `personal_plans` ADD `frequency_months` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `personal_plans` ADD `payment_timing` text DEFAULT 'anticipata' NOT NULL;--> statement-breakpoint
ALTER TABLE `personal_plans` ADD `duration_months` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `personal_plans` ADD `tax_rate_bps` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `personal_plans` ADD `tax_amount_cents` integer DEFAULT 0 NOT NULL;