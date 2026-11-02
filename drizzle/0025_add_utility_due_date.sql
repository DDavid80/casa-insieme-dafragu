ALTER TABLE `utility_bills` ADD `due_date` text;
--> statement-breakpoint
UPDATE utility_bills SET due_date = '2026-09-28' WHERE invoice_number = '38502610985891';
