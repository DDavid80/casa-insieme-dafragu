ALTER TABLE `utility_bills` ADD `billing_frequency` text DEFAULT 'monthly' NOT NULL;
UPDATE `utility_bills` SET `billing_frequency` = 'annual' WHERE lower(`provider`) IN ('prime video', 'amazon prime', 'amazon');
