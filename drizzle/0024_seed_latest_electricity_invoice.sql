WITH luce(invoice_number, issued, period_start, period_end, amount_cents, consumption, wallet, common_account, notes) AS (
  VALUES (
    '38502610985891',
    '2026-09-07',
    '2026-08-01',
    '2026-08-31',
    5969,
    137,
    'BBVA Utenze',
    'BBVA Utenze',
    'Fattura Iren energia elettrica · scadenza 28/09/2026 · di cui 9,00 euro Canone RAI; quota energia elettrica 50,69 euro · POD IT001E12236276 · letture F1/F2/F3 1605/2275/3344'
  )
)
INSERT INTO movements (kind, description, category, amount_cents, person, common_account, date)
SELECT 'Spesa', 'Luce · Iren', 'Utenze', l.amount_cents, 'Comune', l.common_account, l.issued
FROM luce l
WHERE NOT EXISTS (SELECT 1 FROM utility_bills u WHERE u.invoice_number = l.invoice_number);
--> statement-breakpoint
WITH luce(invoice_number, issued, period_start, period_end, amount_cents, consumption, wallet, common_account, notes) AS (
  VALUES (
    '38502610985891',
    '2026-09-07',
    '2026-08-01',
    '2026-08-31',
    5969,
    137,
    'BBVA Utenze',
    'BBVA Utenze',
    'Fattura Iren energia elettrica · scadenza 28/09/2026 · di cui 9,00 euro Canone RAI; quota energia elettrica 50,69 euro · POD IT001E12236276 · letture F1/F2/F3 1605/2275/3344'
  )
)
INSERT INTO utility_bills (
  movement_id, provider, service, amount_cents, wallet, common_account, date,
  recurring, period_start, period_end, consumption, consumption_unit,
  invoice_number, notes, billing_frequency
)
SELECT m.id, 'Iren', 'Luce', l.amount_cents, l.wallet, l.common_account, l.issued,
  0, l.period_start, l.period_end, l.consumption, 'kWh',
  l.invoice_number, l.notes, 'monthly'
FROM luce l
JOIN movements m
  ON m.description = 'Luce · Iren'
  AND m.amount_cents = l.amount_cents
  AND m.date = l.issued
WHERE NOT EXISTS (SELECT 1 FROM utility_bills u WHERE u.invoice_number = l.invoice_number);
--> statement-breakpoint
INSERT INTO common_account_transactions (
  account, direction, description, category, amount_cents, date, source_movement_id
)
SELECT 'BBVA Utenze', 'Spesa', 'Luce · Iren', 'Utenze', u.amount_cents, u.date, u.movement_id
FROM utility_bills u
WHERE u.invoice_number = '38502610985891'
  AND NOT EXISTS (
    SELECT 1 FROM common_account_transactions c
    WHERE c.source_movement_id = u.movement_id
  );
