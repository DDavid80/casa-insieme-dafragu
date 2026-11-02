import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { commonAccountTransactions, goalContributions, movements, scheduledMovements, tripRepayments, trips, utilityBills } from "../../../db/schema";
import { requireAppAccess } from "../../../lib/app-security";
import { isScheduledPrepaidExpense } from "../../../lib/prepaid-card";

function ticketShare(kind: "Spesa" | "Entrata", category: string, commonAccount: string | null | undefined, enteredAmount: number, totalAmount: number) {
  if (kind !== "Spesa") return 0;
  if (enteredAmount > 0) return enteredAmount;
  return /ticket/i.test(category) || commonAccount === "Ticket Satispay" ? totalAmount : 0;
}

export async function GET(request: Request) {
  try {
    const denied = await requireAppAccess(request);
    if (denied) return denied;
    const db = await getDb();
    const rows = await db
      .select()
      .from(movements)
      .orderBy(desc(movements.date), desc(movements.id))
      .limit(500);

    return Response.json({
      movements: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        description: row.description,
        category: row.category,
        amount: row.amountCents / 100,
        person: row.person,
        commonAccount: row.commonAccount,
        ticketAmount: row.ticketAmountCents / 100,
        goalId: row.goalId,
        scheduleId: row.scheduleId,
        date: row.date,
        createdAt: row.createdAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore inatteso";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireAppAccess(request);
    if (denied) return denied;
    const payload = (await request.json()) as {
      kind?: "Spesa" | "Entrata";
      description?: string;
      category?: string;
      amount?: number;
      person?: "Davide" | "Francesca" | "Comune";
      commonAccount?: string;
      ticketAmount?: number;
      goalId?: number | null;
      automaticMonthly?: boolean;
      monthlyDay?: number;
      endDate?: string | null;
      author?: "Davide" | "Francesca";
      date?: string;
    };

    const description = payload.description?.trim() ?? "";
    const category = payload.category?.trim() ?? "";
    const amount = Number(payload.amount);
    const enteredTicketAmount = Number(payload.ticketAmount ?? 0);
    if (
      !description ||
      !category ||
      !payload.kind ||
      !payload.person ||
      !payload.date ||
      !Number.isFinite(amount) ||
      amount <= 0
      || !Number.isFinite(enteredTicketAmount)
      || enteredTicketAmount < 0
      || enteredTicketAmount > amount
    ) {
      return Response.json({ error: "Dati del movimento non validi" }, { status: 400 });
    }

    const ticketAmount = ticketShare(payload.kind, category, payload.commonAccount, enteredTicketAmount, amount);
    const personalAmount = payload.kind === "Spesa" && (payload.person === "Davide" || payload.person === "Francesca") ? amount - ticketAmount : amount;

    const db = await getDb();
    const [row] = await db
      .insert(movements)
      .values({
        kind: payload.kind,
        description,
        category,
        amountCents: Math.round(personalAmount * 100),
        person: payload.person,
        commonAccount: payload.commonAccount ?? null,
        ticketAmountCents: Math.round(ticketAmount * 100),
        goalId: payload.goalId ?? null,
        date: payload.date,
      })
      .returning();

    const scheduledPrepaidExpense = isScheduledPrepaidExpense({ kind: payload.kind, person: payload.person, commonAccount: payload.commonAccount ?? null, scheduleId: payload.automaticMonthly && payload.author ? 1 : null });
    if (payload.commonAccount && payload.commonAccount !== "Ticket Satispay" && (payload.person === "Davide" || payload.person === "Francesca") && payload.kind === "Spesa" && !scheduledPrepaidExpense) {
      await db.insert(commonAccountTransactions).values({
        account: payload.commonAccount,
        direction: "Entrata",
        description: `Versamento da ${payload.person}`,
        category: "Versamento",
        amountCents: Math.round(personalAmount * 100),
        date: payload.date,
        sourceMovementId: row.id,
      });
    }
    if (scheduledPrepaidExpense) await db.insert(commonAccountTransactions).values({ account: payload.commonAccount!, direction: "Spesa", description, category, amountCents: Math.round(personalAmount * 100), date: payload.date, sourceMovementId: row.id });
    if (payload.commonAccount && payload.commonAccount !== "Ticket Satispay" && payload.person === "Comune") {
      await db.insert(commonAccountTransactions).values({
        account: payload.commonAccount,
        direction: payload.kind,
        description,
        category,
        amountCents: Math.round(amount * 100),
        date: payload.date,
        sourceMovementId: row.id,
      });
    }
    if (payload.commonAccount === "Ticket Satispay") await db.insert(commonAccountTransactions).values({ account: "Ticket Satispay", direction: payload.kind, description: payload.kind === "Spesa" ? `Ticket · ${description}` : description, category, amountCents: Math.round((payload.kind === "Spesa" ? ticketAmount : amount) * 100), date: payload.date, sourceMovementId: row.id });
    if (payload.kind === "Spesa" && ticketAmount > 0 && payload.commonAccount !== "Ticket Satispay") await db.insert(commonAccountTransactions).values({ account: "Ticket Satispay", direction: "Spesa", description: `Ticket · ${description}`, category, amountCents: Math.round(ticketAmount * 100), date: payload.date, sourceMovementId: row.id });
    if (payload.kind === "Spesa" && payload.goalId) await db.insert(goalContributions).values({ goalId: payload.goalId, source: `${payload.person} · ${description}`, amountCents: Math.round(amount * 100), date: payload.date, sourceMovementId: row.id });
    if (payload.kind === "Entrata" && payload.commonAccount === "BBVA Dafragu" && !description.startsWith("Regalo di nozze ·")) {
      const [wedding] = await db.select().from(trips).where(eq(trips.title, "Matrimonio 2026"));
      if (wedding) await db.insert(tripRepayments).values({ tripId: wedding.id, label: description, amountCents: Math.round(amount * 100), kind: "money", dueDate: payload.date, paid: true, note: "Accreditato su BBVA Dafragu" });
    }
    if (payload.automaticMonthly && payload.author) { const [schedule] = await db.insert(scheduledMovements).values({ name: description, kind: payload.kind, category, amountCents: Math.round(amount * 100), person: payload.person, commonAccount: payload.commonAccount ?? null, ticketAmountCents: Math.round(ticketAmount * 100), goalId: payload.goalId ?? null, dayOfMonth: Number(payload.monthlyDay || payload.date.slice(8, 10)), startDate: payload.date, endDate: payload.endDate || null, active: true, author: payload.author }).returning(); await db.update(movements).set({ scheduleId: schedule.id }).where(eq(movements.id, row.id)); }

    return Response.json({
      movement: {
        id: row.id,
        kind: row.kind,
        description: row.description,
        category: row.category,
        amount: row.amountCents / 100,
        person: row.person,
        commonAccount: row.commonAccount,
        ticketAmount: row.ticketAmountCents / 100,
        goalId: row.goalId,
        date: row.date,
        createdAt: row.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore inatteso";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const denied = await requireAppAccess(request);
    if (denied) return denied;
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: "Movimento non valido" }, { status: 400 });
    }

    const db = await getDb();
    await db.delete(utilityBills).where(eq(utilityBills.movementId, id));
    await db.delete(goalContributions).where(eq(goalContributions.sourceMovementId, id));
    await db.delete(commonAccountTransactions).where(eq(commonAccountTransactions.sourceMovementId, id));
    const deleted = await db
      .delete(movements)
      .where(eq(movements.id, id))
      .returning({ id: movements.id });

    if (!deleted.length) {
      return Response.json({ error: "Movimento non trovato" }, { status: 404 });
    }

    return Response.json({ deletedId: id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore inatteso";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const denied = await requireAppAccess(request); if (denied) return denied;
    const payload = await request.json() as { id?: number; kind?: "Spesa" | "Entrata"; description?: string; category?: string; amount?: number; person?: "Davide" | "Francesca" | "Comune"; commonAccount?: string | null; ticketAmount?: number; goalId?: number | null; date?: string };
    const id = Number(payload.id); const description = payload.description?.trim() ?? ""; const category = payload.category?.trim() ?? ""; const amount = Number(payload.amount); const enteredTicketAmount = Number(payload.ticketAmount ?? 0);
    if (!Number.isInteger(id) || id <= 0 || !payload.kind || !payload.person || !payload.date || !description || !category || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(enteredTicketAmount) || enteredTicketAmount < 0 || enteredTicketAmount > amount) return Response.json({ error: "Dati del movimento non validi" }, { status: 400 });
    const ticketAmount = ticketShare(payload.kind, category, payload.commonAccount, enteredTicketAmount, amount);
    const personalAmount = payload.kind === "Spesa" && (payload.person === "Davide" || payload.person === "Francesca") ? amount - ticketAmount : amount;
    const db = await getDb();
    await db.delete(commonAccountTransactions).where(eq(commonAccountTransactions.sourceMovementId, id));
    await db.delete(goalContributions).where(eq(goalContributions.sourceMovementId, id));
    const [row] = await db.update(movements).set({ kind: payload.kind, description, category, amountCents: Math.round(personalAmount * 100), person: payload.person, commonAccount: payload.commonAccount ?? null, ticketAmountCents: Math.round(ticketAmount * 100), goalId: payload.goalId ?? null, date: payload.date }).where(eq(movements.id, id)).returning();
    if (!row) return Response.json({ error: "Movimento non trovato" }, { status: 404 });
    const scheduledPrepaidExpense = isScheduledPrepaidExpense(row);
    if (payload.commonAccount && payload.commonAccount !== "Ticket Satispay" && (payload.person === "Davide" || payload.person === "Francesca") && payload.kind === "Spesa" && !scheduledPrepaidExpense) await db.insert(commonAccountTransactions).values({ account: payload.commonAccount, direction: "Entrata", description: `Versamento da ${payload.person}`, category: "Versamento", amountCents: Math.round(personalAmount * 100), date: payload.date, sourceMovementId: row.id });
    if (scheduledPrepaidExpense) await db.insert(commonAccountTransactions).values({ account: payload.commonAccount!, direction: "Spesa", description, category, amountCents: Math.round(personalAmount * 100), date: payload.date, sourceMovementId: row.id });
    if (payload.commonAccount && payload.commonAccount !== "Ticket Satispay" && payload.person === "Comune") await db.insert(commonAccountTransactions).values({ account: payload.commonAccount, direction: payload.kind, description, category, amountCents: Math.round(amount * 100), date: payload.date, sourceMovementId: row.id });
    if (payload.commonAccount === "Ticket Satispay") await db.insert(commonAccountTransactions).values({ account: "Ticket Satispay", direction: payload.kind, description: payload.kind === "Spesa" ? `Ticket · ${description}` : description, category, amountCents: Math.round((payload.kind === "Spesa" ? ticketAmount : amount) * 100), date: payload.date, sourceMovementId: row.id });
    if (payload.kind === "Spesa" && ticketAmount > 0 && payload.commonAccount !== "Ticket Satispay") await db.insert(commonAccountTransactions).values({ account: "Ticket Satispay", direction: "Spesa", description: `Ticket · ${description}`, category, amountCents: Math.round(ticketAmount * 100), date: payload.date, sourceMovementId: row.id });
    if (payload.kind === "Spesa" && payload.goalId) await db.insert(goalContributions).values({ goalId: payload.goalId, source: `${payload.person} · ${description}`, amountCents: Math.round(amount * 100), date: payload.date, sourceMovementId: row.id });
    return Response.json({ movement: { id: row.id, kind: row.kind, description: row.description, category: row.category, amount: row.amountCents / 100, person: row.person, commonAccount: row.commonAccount, ticketAmount: row.ticketAmountCents / 100, goalId: row.goalId, date: row.date, createdAt: row.createdAt } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Errore inatteso" }, { status: 500 }); }
}
