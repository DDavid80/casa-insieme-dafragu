ALTER TABLE `personal_plan_payments` ADD `skipped` integer DEFAULT false NOT NULL;
-- Keep one automatic record for each PAC due date, then prevent concurrent refreshes from duplicating it.
DELETE FROM `personal_plan_payments`
WHERE `automatic` = 1
  AND `id` NOT IN (
    SELECT MIN(`id`)
    FROM `personal_plan_payments`
    WHERE `automatic` = 1
    GROUP BY `plan_id`, `date`
  );
CREATE UNIQUE INDEX IF NOT EXISTS `personal_plan_payments_automatic_due_unique`
  ON `personal_plan_payments` (`plan_id`, `date`)
  WHERE `automatic` = 1;
