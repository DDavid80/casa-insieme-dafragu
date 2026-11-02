CREATE TABLE `balance_adjustments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account` text NOT NULL,
	`delta_cents` integer NOT NULL,
	`resulting_balance_cents` integer NOT NULL,
	`date` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`author` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `debt_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`debt_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`date` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`automatic` integer DEFAULT false NOT NULL,
	`movement_id` integer,
	`author` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `debts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`creditor` text DEFAULT '' NOT NULL,
	`original_amount_cents` integer DEFAULT 0 NOT NULL,
	`installment_cents` integer DEFAULT 0 NOT NULL,
	`day_of_month` integer DEFAULT 1 NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`automatic` integer DEFAULT false NOT NULL,
	`variable` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`common_account` text,
	`reminder_days` integer DEFAULT 7 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`author` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `personal_plan_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`date` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`automatic` integer DEFAULT false NOT NULL,
	`author` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `personal_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'PAC' NOT NULL,
	`institution` text DEFAULT '' NOT NULL,
	`target_cents` integer DEFAULT 0 NOT NULL,
	`monthly_amount_cents` integer DEFAULT 0 NOT NULL,
	`day_of_month` integer DEFAULT 1 NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`automatic` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`reminder_days` integer DEFAULT 7 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`author` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scheduled_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`category` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`person` text NOT NULL,
	`common_account` text,
	`ticket_amount_cents` integer DEFAULT 0 NOT NULL,
	`goal_id` integer,
	`day_of_month` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`active` integer DEFAULT true NOT NULL,
	`author` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `movements` ADD `goal_id` integer;--> statement-breakpoint
ALTER TABLE `movements` ADD `schedule_id` integer;