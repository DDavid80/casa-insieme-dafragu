import { getDb } from "../../../db";
import {
  balanceAdjustments,
  insurancePlans,
  budgets,
  chatMessages,
  commonAccountTransactions,
  deadlines,
  debtPayments,
  debts,
  duplicateAcknowledgements,
  goalContributions,
  goals,
  houseDecisions,
  movements,
  notes,
  personalPlanAdjustments,
  personalPlanPayments,
  personalPlans,
  scheduledMovements,
  settings,
  tripExpenses,
  tripRepayments,
  trips,
  utilityBills,
} from "../../../db/schema";
import { requireAppAccess } from "../../../lib/app-security";

const format = "CASA_INSIEME_BACKUP";
const version = 2;

const tables = {
  insurancePlans,
  settings,
  movements,
  duplicateAcknowledgements,
  scheduledMovements,
  personalPlans,
  personalPlanPayments,
  personalPlanAdjustments,
  debts,
  debtPayments,
  balanceAdjustments,
  notes,
  utilityBills,
  commonAccountTransactions,
  budgets,
  goals,
  goalContributions,
  chatMessages,
  deadlines,
  houseDecisions,
  trips,
  tripExpenses,
  tripRepayments,
};

const insertOrder: (keyof typeof tables)[] = [
  "insurancePlans",
  "settings",
  "movements",
  "duplicateAcknowledgements",
  "scheduledMovements",
  "personalPlans",
  "personalPlanPayments",
  "personalPlanAdjustments",
  "debts",
  "debtPayments",
  "balanceAdjustments",
  "notes",
  "deadlines",
  "utilityBills",
  "commonAccountTransactions",
  "budgets",
  "goals",
  "goalContributions",
  "chatMessages",
  "houseDecisions",
  "trips",
  "tripExpenses",
  "tripRepayments",
];

export async function GET(request: Request) {
  const denied = await requireAppAccess(request);
  if (denied) return denied;
  try {
    const db = await getDb();
    const data = Object.fromEntries(
      await Promise.all(
        Object.entries(tables).map(async ([name, table]) => [
          name,
          await db.select().from(table),
        ]),
      ),
    );
    return Response.json({
      format,
      version,
      exportedAt: new Date().toISOString(),
      data,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Backup non disponibile",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const denied = await requireAppAccess(request);
  if (denied) return denied;
  try {
    const payload = (await request.json()) as {
      format?: string;
      version?: number;
      data?: Record<string, unknown>;
    };
    if (
      payload.format !== format ||
      payload.version !== version ||
      !payload.data
    )
      return Response.json(
        { error: "Questo file non è un backup Casa Insieme compatibile." },
        { status: 400 },
      );
    const db = await getDb();
    const client = db.$client;
    let restoreContext = "inizializzazione";
    const rows = (name: keyof typeof tables) =>
      Array.isArray(payload.data?.[name])
        ? (payload.data[name] as Record<string, unknown>[])
        : [];
    for (const table of [
      insurancePlans,
      duplicateAcknowledgements,
      tripRepayments,
      tripExpenses,
      trips,
      houseDecisions,
      debtPayments,
      debts,
      personalPlanAdjustments,
      personalPlanPayments,
      personalPlans,
      scheduledMovements,
      goalContributions,
      goals,
      utilityBills,
      commonAccountTransactions,
      movements,
      budgets,
      deadlines,
      chatMessages,
      notes,
      balanceAdjustments,
      settings,
    ])
      await db.delete(table);
    for (const name of insertOrder) {
      const table = tables[name];
      const items = rows(name);
      // D1/SQLite limits the number of bound variables in one statement.
      // Large backups (especially movements) must therefore be restored in
      // bounded batches instead of one multi-row insert.
      for (let start = 0; start < items.length; start += 10) {
        const batch = items.slice(start, start + 10);
        restoreContext = `${name} righe ${start + 1}-${start + batch.length}`;
        if (batch.length && name === "commonAccountTransactions") {
          await client.batch(
            batch.map((item) => {
              const row = item as Record<string, unknown>;
              return client
                .prepare(
                  "INSERT INTO common_account_transactions (account, direction, description, category, amount_cents, date, source_movement_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(
                  row.account,
                  row.direction,
                  row.description,
                  row.category,
                  row.amountCents,
                  row.date,
                  row.sourceMovementId ?? null,
                  row.createdAt,
                );
            }),
          );
        } else if (batch.length && name === "trips") {
          await client.batch(
            batch.map((item) => {
              const row = item as Record<string, unknown>;
              return client
                .prepare(
                  "INSERT INTO trips (id, title, start_date, end_date, budget_cents, notes, active, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(
                  row.id,
                  row.title,
                  row.startDate,
                  row.endDate,
                  row.budgetCents,
                  row.notes,
                  row.active === false ? 0 : 1,
                  row.completedAt ?? null,
                  row.createdAt,
                );
            }),
          );
        } else if (batch.length) {
          const normalized = batch.map((item) =>
            name === "utilityBills"
              ? {
                  ...(item as Record<string, unknown>),
                  movementId:
                    (item as Record<string, unknown>).movementId ?? 0,
                  deadlineId:
                    (item as Record<string, unknown>).deadlineId ?? null,
                }
              : item,
          );
          await db.batch(
            normalized.map((item) => db.insert(table).values(item as never)) as never,
          );
        }
      }
    }
    return Response.json({ restoredAt: new Date().toISOString() });
  } catch (error) {
    return Response.json(
      {
        error:
          `${restoreContext}: ${error instanceof Error ? error.message : "Ripristino non riuscito"}`,
      },
      { status: 500 },
    );
  }
}
