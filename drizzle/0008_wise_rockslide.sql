ALTER TABLE `deadlines` ADD `recurrence` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `notes` ADD `author` text DEFAULT 'Davide' NOT NULL;--> statement-breakpoint
ALTER TABLE `utility_bills` ADD `recurring` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `utility_bills` ADD `deadline_id` integer;