CREATE TABLE `insurance_plans` (
  `id` text PRIMARY KEY NOT NULL,
  `revision` integer DEFAULT 1 NOT NULL,
  `data` text NOT NULL
);
