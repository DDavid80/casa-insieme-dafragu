import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const insurancePlans = sqliteTable("insurance_plans", {
  id: text("id").primaryKey(),
  revision: integer("revision").notNull().default(1),
  data: text("data").notNull(),
});

export const movements = sqliteTable("movements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["Spesa", "Entrata"] }).notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  amountCents: integer("amount_cents").notNull(),
  person: text("person", { enum: ["Davide", "Francesca", "Comune"] }).notNull(),
  commonAccount: text("common_account"),
  ticketAmountCents: integer("ticket_amount_cents").notNull().default(0),
  goalId: integer("goal_id"),
  scheduleId: integer("schedule_id"),
  date: text("date").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const duplicateAcknowledgements = sqliteTable(
  "duplicate_acknowledgements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    duplicateKey: text("duplicate_key").notNull().unique(),
    author: text("author", { enum: ["Davide", "Francesca"] }).notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
);

export const scheduledMovements = sqliteTable("scheduled_movements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["Spesa", "Entrata"] }).notNull(),
  category: text("category").notNull(),
  amountCents: integer("amount_cents").notNull(),
  person: text("person", { enum: ["Davide", "Francesca", "Comune"] }).notNull(),
  commonAccount: text("common_account"),
  ticketAmountCents: integer("ticket_amount_cents").notNull().default(0),
  goalId: integer("goal_id"),
  dayOfMonth: integer("day_of_month").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  author: text("author", { enum: ["Davide", "Francesca"] }).notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const personalPlans = sqliteTable("personal_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  person: text("person", { enum: ["Davide", "Francesca", "Comune"] }).notNull(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("PAC"),
  institution: text("institution").notNull().default(""),
  targetCents: integer("target_cents").notNull().default(0),
  monthlyAmountCents: integer("monthly_amount_cents").notNull().default(0),
  initialSavedCents: integer("initial_saved_cents").notNull().default(0),
  frequencyMonths: integer("frequency_months").notNull().default(1),
  paymentTiming: text("payment_timing", {
    enum: ["anticipata", "posticipata", "libera"],
  })
    .notNull()
    .default("anticipata"),
  durationMonths: integer("duration_months").notNull().default(0),
  taxRateBps: integer("tax_rate_bps").notNull().default(0),
  taxAmountCents: integer("tax_amount_cents").notNull().default(0),
  dayOfMonth: integer("day_of_month").notNull().default(1),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  automatic: integer("automatic", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  reminderDays: integer("reminder_days").notNull().default(7),
  notes: text("notes").notNull().default(""),
  author: text("author", { enum: ["Davide", "Francesca"] }).notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const personalPlanPayments = sqliteTable("personal_plan_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  planId: integer("plan_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  date: text("date").notNull(),
  note: text("note").notNull().default(""),
  automatic: integer("automatic", { mode: "boolean" }).notNull().default(false),
  skipped: integer("skipped", { mode: "boolean" }).notNull().default(false),
  author: text("author", { enum: ["Davide", "Francesca"] }).notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const personalPlanAdjustments = sqliteTable(
  "personal_plan_adjustments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    planId: integer("plan_id").notNull(),
    previousBalanceCents: integer("previous_balance_cents").notNull(),
    newBalanceCents: integer("new_balance_cents").notNull(),
    deltaCents: integer("delta_cents").notNull(),
    note: text("note").notNull().default(""),
    author: text("author", { enum: ["Davide", "Francesca"] }).notNull(),
    adjustedAt: text("adjusted_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
);

export const debts = sqliteTable("debts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  person: text("person", { enum: ["Davide", "Francesca", "Comune"] }).notNull(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  creditor: text("creditor").notNull().default(""),
  originalAmountCents: integer("original_amount_cents").notNull().default(0),
  installmentCents: integer("installment_cents").notNull().default(0),
  initialPaidCents: integer("initial_paid_cents").notNull().default(0),
  dayOfMonth: integer("day_of_month").notNull().default(1),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  automatic: integer("automatic", { mode: "boolean" }).notNull().default(false),
  variable: integer("variable", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  commonAccount: text("common_account"),
  reminderDays: integer("reminder_days").notNull().default(7),
  notes: text("notes").notNull().default(""),
  author: text("author", { enum: ["Davide", "Francesca"] }).notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const debtPayments = sqliteTable("debt_payments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  debtId: integer("debt_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  date: text("date").notNull(),
  note: text("note").notNull().default(""),
  automatic: integer("automatic", { mode: "boolean" }).notNull().default(false),
  movementId: integer("movement_id"),
  author: text("author", { enum: ["Davide", "Francesca"] }).notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const debtAdjustments = sqliteTable("debt_adjustments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  debtId: integer("debt_id").notNull(),
  previousResidualCents: integer("previous_residual_cents").notNull(),
  newResidualCents: integer("new_residual_cents").notNull(),
  deltaCents: integer("delta_cents").notNull(),
  note: text("note").notNull().default(""),
  author: text("author", { enum: ["Davide", "Francesca"] }).notNull(),
  adjustedAt: text("adjusted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const balanceAdjustments = sqliteTable("balance_adjustments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  account: text("account").notNull(),
  deltaCents: integer("delta_cents").notNull(),
  resultingBalanceCents: integer("resulting_balance_cents").notNull(),
  date: text("date").notNull(),
  note: text("note").notNull().default(""),
  author: text("author", { enum: ["Davide", "Francesca"] }).notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  content: text("content").notNull(),
  author: text("author", { enum: ["Davide", "Francesca"] })
    .notNull()
    .default("Davide"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const settings = sqliteTable("settings", {
  id: integer("id").primaryKey(),
  title: text("title").notNull().default("Casa Insieme"),
  commonAccounts: text("common_accounts")
    .notNull()
    .default('["N26","BBVA Dafragu","BBVA Utenze","Ticket Satispay"]'),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const utilityBills = sqliteTable("utility_bills", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  movementId: integer("movement_id").notNull(),
  provider: text("provider").notNull(),
  service: text("service").notNull(),
  amountCents: integer("amount_cents").notNull(),
  wallet: text("wallet").notNull(),
  commonAccount: text("common_account"),
  date: text("date").notNull(),
  dueDate: text("due_date"),
  recurring: integer("recurring", { mode: "boolean" }).notNull().default(false),
  billingFrequency: text("billing_frequency", { enum: ["monthly", "annual"] })
    .notNull()
    .default("monthly"),
  deadlineId: integer("deadline_id"),
  periodStart: text("period_start"),
  periodEnd: text("period_end"),
  consumption: real("consumption"),
  consumptionUnit: text("consumption_unit"),
  meterReading: real("meter_reading"),
  invoiceNumber: text("invoice_number"),
  notes: text("notes"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const commonAccountTransactions = sqliteTable(
  "common_account_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    account: text("account").notNull(),
    direction: text("direction", { enum: ["Entrata", "Spesa"] }).notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    amountCents: integer("amount_cents").notNull(),
    date: text("date").notNull(),
    sourceMovementId: integer("source_movement_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
);

export const budgets = sqliteTable("budgets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  month: text("month").notNull(),
  category: text("category").notNull(),
  limitCents: integer("limit_cents").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  targetCents: integer("target_cents").notNull(),
  photoKey: text("photo_key"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const goalContributions = sqliteTable("goal_contributions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  goalId: integer("goal_id").notNull(),
  source: text("source").notNull(),
  amountCents: integer("amount_cents").notNull(),
  date: text("date").notNull(),
  sourceMovementId: integer("source_movement_id"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  author: text("author", { enum: ["Davide", "Francesca"] }).notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const deadlines = sqliteTable("deadlines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  date: text("date").notNull(),
  reminderDays: integer("reminder_days").notNull().default(1),
  note: text("note").notNull().default(""),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  recurrence: text("recurrence", { enum: ["none", "monthly", "yearly"] })
    .notNull()
    .default("none"),
  person: text("person", { enum: ["Davide", "Francesca", "Comune"] })
    .notNull()
    .default("Comune"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const appSecurity = sqliteTable("app_security", {
  id: integer("id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  cookieSecret: text("cookie_secret").notNull(),
  recoveryHash: text("recovery_hash"),
  recoverySalt: text("recovery_salt"),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const houseDecisions = sqliteTable("house_decisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  author: text("author", { enum: ["Davide", "Francesca"] }).notNull(),
  status: text("status", { enum: ["Da valutare", "Decisa"] })
    .notNull()
    .default("Da valutare"),
  date: text("date").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const trips = sqliteTable("trips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  startDate: text("start_date").notNull().default(""),
  endDate: text("end_date").notNull().default(""),
  budgetCents: integer("budget_cents").notNull().default(0),
  notes: text("notes").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  completedAt: text("completed_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const tripExpenses = sqliteTable("trip_expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tripId: integer("trip_id").notNull(),
  label: text("label").notNull(),
  section: text("section").notNull().default("Altro"),
  note: text("note").notNull().default(""),
  amountCents: integer("amount_cents").notNull(),
  paid: integer("paid", { mode: "boolean" }).notNull().default(false),
  affectsAccounts: integer("affects_accounts", { mode: "boolean" })
    .notNull()
    .default(true),
  paidDate: text("paid_date"),
  payer: text("payer").notNull().default("Comune"),
  commonAccount: text("common_account"),
  movementId: integer("movement_id"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const tripRepayments = sqliteTable("trip_repayments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tripId: integer("trip_id").notNull(),
  label: text("label").notNull(),
  amountCents: integer("amount_cents").notNull(),
  kind: text("kind").notNull().default("money"),
  dueDate: text("due_date").notNull(),
  paid: integer("paid", { mode: "boolean" }).notNull().default(false),
  note: text("note").notNull().default(""),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
