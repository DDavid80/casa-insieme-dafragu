import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { balanceAdjustments, commonAccountTransactions, goalContributions, goals, movements } from "../../../db/schema";
import { requireAppAccess } from "../../../lib/app-security";
import { reconcileWeddingGifts } from "../../../lib/wedding-gifts";

const TICKET_RECONCILIATION_NOTE = "Riallineamento Ticket Satispay al saldo verificato";

async function reconcileTicketSatispay(db: Awaited<ReturnType<typeof getDb>>) {
  const ticketRows = await db
    .select()
    .from(commonAccountTransactions)
    .where(eq(commonAccountTransactions.account, "Ticket Satispay"));
  const hasMissingExpense = ticketRows.some(
    (item) =>
      item.direction === "Spesa" &&
      item.date === "2026-10-24" &&
      item.amountCents === 7513 &&
      /ipercoop/i.test(item.description),
  );
  if (!hasMissingExpense) {
    const [movement] = await db
      .insert(movements)
      .values({
        kind: "Spesa",
        description: "Spesa Ipercoop",
        category: "Supermercato",
        amountCents: 7513,
        person: "Comune",
        commonAccount: "Ticket Satispay",
        ticketAmountCents: 0,
        date: "2026-10-24",
      })
      .returning();
    await db.insert(commonAccountTransactions).values({
      account: "Ticket Satispay",
      direction: "Spesa",
      description: "Ticket · Spesa Ipercoop",
      category: "Supermercato",
      amountCents: 7513,
      date: "2026-10-24",
      sourceMovementId: movement.id,
    });
  }

  const adjustments = await db
    .select()
    .from(balanceAdjustments)
    .where(eq(balanceAdjustments.account, "Ticket Satispay"));
  if (!adjustments.some((item) => item.note === TICKET_RECONCILIATION_NOTE)) {
    await db.insert(balanceAdjustments).values({
      account: "Ticket Satispay",
      deltaCents: -9212,
      resultingBalanceCents: 44300,
      date: "2026-11-01",
      note: TICKET_RECONCILIATION_NOTE,
      author: "Davide",
    });
  }
}

export async function GET(request: Request) {
  const denied = await requireAppAccess(request);
  if (denied) return denied;
  const db = await getDb();
  await reconcileWeddingGifts(db);
  await reconcileTicketSatispay(db);
  const rows = await db
    .select({ transaction: commonAccountTransactions, person: movements.person })
    .from(commonAccountTransactions)
    .leftJoin(movements, eq(commonAccountTransactions.sourceMovementId, movements.id))
    .orderBy(desc(commonAccountTransactions.date), desc(commonAccountTransactions.id))
    .limit(1000);
  return Response.json({
    transactions: rows.map(({ transaction, person }) => ({
      ...transaction,
      amount: transaction.amountCents / 100,
      // Le vecchie registrazioni senza movimento origine sono condivise.
      person: person ?? "Comune",
    })),
  });
}

export async function POST(request: Request) {
  try {
    const denied = await requireAppAccess(request);
    if (denied) return denied;
    const payload = (await request.json()) as { account?: string; kind?: "Entrata" | "Spesa"; description?: string; category?: string; amount?: number; date?: string };
    const amount = Number(payload.amount);
    const account = payload.account ?? "";
    const description = payload.description?.trim() ?? "";
    const category = payload.category?.trim() ?? "";
    if (!account || account.length > 60 || !payload.kind || !description || !category || !payload.date || !Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: "Dati del conto non validi" }, { status: 400 });
    }
    const db = await getDb();
    const [movement] = await db.insert(movements).values({ kind: payload.kind, description, category, amountCents: Math.round(amount * 100), person: "Comune", commonAccount: account, date: payload.date }).returning();
    const [transaction] = await db.insert(commonAccountTransactions).values({ account, direction: payload.kind, description, category, amountCents: Math.round(amount * 100), date: payload.date, sourceMovementId: movement.id }).returning();
    if (payload.kind === "Spesa") { const goalRows = await db.select().from(goals); const goal = goalRows.find((item) => item.name.trim().toLocaleLowerCase("it") === category.toLocaleLowerCase("it")); if (goal) await db.insert(goalContributions).values({ goalId: goal.id, source: `${account} · ${description}`, amountCents: Math.round(amount * 100), date: payload.date, sourceMovementId: movement.id }); }
    return Response.json({ movement: { ...movement, amount: movement.amountCents / 100, ticketAmount: movement.ticketAmountCents / 100 }, transaction: { ...transaction, amount: transaction.amountCents / 100, person: "Comune" } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Errore inatteso" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const denied = await requireAppAccess(request);
  if (denied) return denied;
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Registrazione non valida" }, { status: 400 });
  const db = await getDb();
  const rows = await db.select().from(commonAccountTransactions).where(eq(commonAccountTransactions.id, id)).limit(1);
  if (!rows.length) return Response.json({ error: "Registrazione non trovata" }, { status: 404 });
  await db.delete(commonAccountTransactions).where(eq(commonAccountTransactions.id, id));
  if (rows[0].sourceMovementId) await db.delete(goalContributions).where(eq(goalContributions.sourceMovementId, rows[0].sourceMovementId));
  if (rows[0].sourceMovementId) await db.delete(movements).where(eq(movements.id, rows[0].sourceMovementId));
  return Response.json({ deletedId: id, movementId: rows[0].sourceMovementId });
}

export async function PATCH(request: Request) {
  try {
    const denied = await requireAppAccess(request); if (denied) return denied;
    const payload = await request.json() as { id?: number; account?: string; kind?: "Entrata" | "Spesa"; description?: string; category?: string; amount?: number; date?: string };
    const id = Number(payload.id); const amount = Number(payload.amount); const account = payload.account?.trim() ?? ""; const description = payload.description?.trim() ?? ""; const category = payload.category?.trim() ?? "";
    if (!Number.isInteger(id) || id <= 0 || !account || !payload.kind || !description || !category || !payload.date || !Number.isFinite(amount) || amount <= 0) return Response.json({ error: "Dati del conto non validi" }, { status: 400 });
    const db = await getDb(); const [old] = await db.select().from(commonAccountTransactions).where(eq(commonAccountTransactions.id, id)); if (!old) return Response.json({ error: "Registrazione non trovata" }, { status: 404 });
    if (old.sourceMovementId) await db.delete(goalContributions).where(eq(goalContributions.sourceMovementId, old.sourceMovementId));
    const [transaction] = await db.update(commonAccountTransactions).set({ account, direction: payload.kind, description, category, amountCents: Math.round(amount * 100), date: payload.date }).where(eq(commonAccountTransactions.id, id)).returning();
    let movement = null; if (old.sourceMovementId) [movement] = await db.update(movements).set({ kind: payload.kind, description, category, amountCents: Math.round(amount * 100), person: "Comune", commonAccount: account, date: payload.date }).where(eq(movements.id, old.sourceMovementId)).returning();
    if (payload.kind === "Spesa" && old.sourceMovementId) { const goalRows = await db.select().from(goals); const goal = goalRows.find((item) => item.name.trim().toLocaleLowerCase("it") === category.toLocaleLowerCase("it")); if (goal) await db.insert(goalContributions).values({ goalId: goal.id, source: `${account} · ${description}`, amountCents: Math.round(amount * 100), date: payload.date, sourceMovementId: old.sourceMovementId }); }
    return Response.json({ transaction: { ...transaction, amount: transaction.amountCents / 100, person: "Comune" }, movement: movement ? { ...movement, amount: movement.amountCents / 100, ticketAmount: movement.ticketAmountCents / 100 } : null });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Errore inatteso" }, { status: 500 }); }
}
