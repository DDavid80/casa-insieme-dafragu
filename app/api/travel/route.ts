import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { commonAccountTransactions, movements, tripExpenses, tripRepayments, trips } from "../../../db/schema";
import { requireAppAccess } from "../../../lib/app-security";
import { reconcileWeddingGifts, removeWeddingGiftFromBbva, syncWeddingGiftToBbva } from "../../../lib/wedding-gifts";

const expenseJson = (row: typeof tripExpenses.$inferSelect) => ({ ...row, amount: row.amountCents / 100 });
const repaymentJson = (row: typeof tripRepayments.$inferSelect) => ({ ...row, amount: row.amountCents / 100 });
const tripJson = (row: typeof trips.$inferSelect) => ({ ...row, budget: row.budgetCents / 100 });

async function syncExpenseMovement(db: Awaited<ReturnType<typeof getDb>>, old: typeof tripExpenses.$inferSelect | null, data: { label: string; section: string; note: string; amountCents: number; paid: boolean; affectsAccounts: boolean; paidDate: string | null; payer: string; commonAccount: string | null }) {
  let movementId = old?.movementId ?? null;
  if (movementId) await db.delete(commonAccountTransactions).where(eq(commonAccountTransactions.sourceMovementId, movementId));
  if ((!data.paid || !data.affectsAccounts) && movementId) { await db.delete(movements).where(eq(movements.id, movementId)); return null; }
  if (!data.paid || !data.affectsAccounts) return null;
  const person = data.payer === "Davide" || data.payer === "Francesca" ? data.payer : "Comune";
  const values = { kind: "Spesa" as const, description: `Viaggio · ${data.label}`, category: "Viaggi", amountCents: data.amountCents, person: person as "Davide" | "Francesca" | "Comune", commonAccount: data.commonAccount, date: data.paidDate! };
  if (movementId) await db.update(movements).set(values).where(eq(movements.id, movementId));
  else { const [movement] = await db.insert(movements).values(values).returning(); movementId = movement.id; }
  if (data.commonAccount && movementId) await db.insert(commonAccountTransactions).values({ account: data.commonAccount, direction: "Spesa", description: values.description, category: "Viaggi", amountCents: data.amountCents, date: data.paidDate!, sourceMovementId: movementId });
  return movementId;
}

export async function GET(request: Request) {
  const denied = await requireAppAccess(request); if (denied) return denied;
  try { const db = await getDb(); await reconcileWeddingGifts(db); const [tripRows, expenseRows, repaymentRows] = await Promise.all([db.select().from(trips).orderBy(desc(trips.startDate), desc(trips.id)), db.select().from(tripExpenses).orderBy(asc(tripExpenses.id)), db.select().from(tripRepayments).orderBy(asc(tripRepayments.dueDate), asc(tripRepayments.id))]); return Response.json({ trips: tripRows.map(tripJson), expenses: expenseRows.map(expenseJson), repayments: repaymentRows.map(repaymentJson) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Errore inatteso" }, { status: 500 }); }
}

export async function POST(request: Request) {
  const denied = await requireAppAccess(request); if (denied) return denied;
  try {
    const payload = await request.json() as Record<string, unknown>; const action = String(payload.action ?? ""); const db = await getDb();
    if (action === "wedding2026") {
      const [existing] = await db.select().from(trips).where(eq(trips.title, "Matrimonio 2026"));
      if (existing) {
        const existingExpenses = await db.select().from(tripExpenses).where(eq(tripExpenses.tripId, existing.id));
        const untouched = existingExpenses.length > 0 && existingExpenses.every((item) => !item.paid && item.affectsAccounts && !item.movementId);
        if (untouched) {
          const alreadyPaid = ["Celebrazione Las Vegas", "Fedi", "Celebrazione in Comune", "Bolli Comune", "Bomboniere", "Torta", "Fotografo", "Sito foto"];
          for (const item of existingExpenses) if (alreadyPaid.includes(item.label)) await db.update(tripExpenses).set({ paid: true, affectsAccounts: false }).where(eq(tripExpenses.id, item.id));
        }
        return Response.json({ trip: tripJson(existing), created: false });
      }
      const [trip] = await db.insert(trips).values({
        title: "Matrimonio 2026",
        startDate: "2026-08-18",
        endDate: "2026-09-19",
        budgetCents: 522600,
        notes: "Piano spese condiviso: celebrazione a Las Vegas e festa in Italia.",
        active: true,
      }).returning();
      const weddingExpenses = [
        ["Celebrazione Las Vegas", "Cerimonia", "", 45000, true],
        ["Fedi", "Cerimonia", "", 29200, true],
        ["Celebrazione in Comune", "Cerimonia", "Cerimonia", 15000, true],
        ["Bolli Comune", "Cerimonia", "Bolli", 1600, true],
        ["Ristorante · adulti", "Ristoranti", "68 persone × 40,00 €", 272000],
        ["Ristorante · bambini", "Ristoranti", "9 bambini × 30,00 €", 27000],
        ["Bomboniere", "Ricevimento", "", 23500, true],
        ["Bicchierata", "Ricevimento", "", 30000],
        ["Torta", "Ricevimento", "77 persone × 4,00 €", 30800, true],
        ["Fotografo", "Servizi", "", 25000, true],
        ["Sito foto", "Servizi", "", 3500, true],
        ["Fiori", "Allestimenti", "", 20000],
      ] as const;
      await db.insert(tripExpenses).values(weddingExpenses.map(([label, section, note, amountCents, alreadyPaid = false]) => ({ tripId: trip.id, label, section, note, amountCents, paid: alreadyPaid, affectsAccounts: !alreadyPaid, payer: "Comune" })));
      await db.insert(tripRepayments).values([
        { tripId: trip.id, label: "Luca", amountCents: 100000, dueDate: "2026-09-11", paid: true, note: "Regalo ricevuto" },
        { tripId: trip.id, label: "Ale Amadei", amountCents: 50000, dueDate: "2026-09-11", paid: true, note: "Regalo ricevuto" },
        { tripId: trip.id, label: "Claudio e Cri", amountCents: 20000, dueDate: "2026-09-11", paid: true, note: "Regalo ricevuto" },
        { tripId: trip.id, label: "Minelli", amountCents: 5000, dueDate: "2026-09-11", paid: true, note: "Regalo ricevuto" },
        { tripId: trip.id, label: "Mamma Emily", amountCents: 10000, dueDate: "2026-09-11", paid: true, note: "Regalo ricevuto" },
        { tripId: trip.id, label: "Debora & Mauri", amountCents: 30000, dueDate: "2026-09-11", paid: true, note: "Regalo ricevuto" },
        { tripId: trip.id, label: "Ale e Manu", amountCents: 15000, dueDate: "2026-09-11", paid: true, note: "Regalo ricevuto" },
      ]);
      return Response.json({ trip: tripJson(trip), created: true }, { status: 201 });
    }
    if (action === "trip") { const title = String(payload.title ?? "").trim(); const budget = Number(payload.budget ?? 0); if (!title || !Number.isFinite(budget) || budget < 0) return Response.json({ error: "Viaggio non valido" }, { status: 400 }); const [trip] = await db.insert(trips).values({ title, startDate: String(payload.startDate ?? ""), endDate: String(payload.endDate ?? ""), budgetCents: Math.round(budget * 100), notes: String(payload.notes ?? "").trim(), active: true }).returning(); return Response.json({ trip: tripJson(trip) }, { status: 201 }); }
    if (action === "expense") { const tripId = Number(payload.tripId); const label = String(payload.label ?? "").trim(); const amount = Number(payload.amount); const paid = Boolean(payload.paid); const affectsAccounts = payload.affectsAccounts !== false; const paidDate = paid ? String(payload.paidDate || new Date().toISOString().slice(0, 10)) : null; const payer = String(payload.payer ?? "Comune"); const commonAccount = payer === "Davide" || payer === "Francesca" || payer === "Comune" ? null : payer; if (!Number.isInteger(tripId) || !label || !Number.isFinite(amount) || amount <= 0) return Response.json({ error: "Spesa non valida" }, { status: 400 }); const data = { label, section: String(payload.section ?? "Altro").trim() || "Altro", note: String(payload.note ?? "").trim(), amountCents: Math.round(amount * 100), paid, affectsAccounts, paidDate, payer, commonAccount }; const movementId = await syncExpenseMovement(db, null, data); const [expense] = await db.insert(tripExpenses).values({ tripId, ...data, movementId }).returning(); return Response.json({ expense: expenseJson(expense) }, { status: 201 }); }
    if (action === "repayment") { const tripId = Number(payload.tripId); const label = String(payload.label ?? "").trim(); const kind = payload.kind === "object" ? "object" : "money"; const amount = Number(payload.amount || 0); const dueDate = String(payload.dueDate ?? ""); if (!Number.isInteger(tripId) || !label || !dueDate || !Number.isFinite(amount) || (kind === "money" && amount <= 0)) return Response.json({ error: "Rientro non valido" }, { status: 400 }); const [repayment] = await db.insert(tripRepayments).values({ tripId, label, amountCents: kind === "object" ? 0 : Math.round(amount * 100), kind, dueDate, paid: Boolean(payload.paid), note: String(payload.note ?? "").trim() }).returning(); const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)); await syncWeddingGiftToBbva(db, repayment, trip?.title === "Matrimonio 2026"); return Response.json({ repayment: repaymentJson(repayment) }, { status: 201 }); }
    return Response.json({ error: "Azione non valida" }, { status: 400 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Errore inatteso" }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  const denied = await requireAppAccess(request); if (denied) return denied;
  try {
    const payload = await request.json() as Record<string, unknown>; const action = String(payload.action ?? ""); const id = Number(payload.id); if (!Number.isInteger(id)) return Response.json({ error: "Elemento non valido" }, { status: 400 }); const db = await getDb();
    if (action === "tripStatus") { const active = Boolean(payload.active); const [trip] = await db.update(trips).set({ active, completedAt: active ? null : new Date().toISOString() }).where(eq(trips.id, id)).returning(); return trip ? Response.json({ trip: tripJson(trip) }) : Response.json({ error: "Viaggio non trovato" }, { status: 404 }); }
    if (action === "trip") { const title = String(payload.title ?? "").trim(); const budget = Number(payload.budget ?? 0); if (!title || !Number.isFinite(budget) || budget < 0) return Response.json({ error: "Viaggio non valido" }, { status: 400 }); const [trip] = await db.update(trips).set({ title, startDate: String(payload.startDate ?? ""), endDate: String(payload.endDate ?? ""), budgetCents: Math.round(budget * 100), notes: String(payload.notes ?? "").trim() }).where(eq(trips.id, id)).returning(); return trip ? Response.json({ trip: tripJson(trip) }) : Response.json({ error: "Viaggio non trovato" }, { status: 404 }); }
    if (action === "expense") { const [old] = await db.select().from(tripExpenses).where(eq(tripExpenses.id, id)); if (!old) return Response.json({ error: "Spesa non trovata" }, { status: 404 }); const label = String(payload.label ?? "").trim(); const amount = Number(payload.amount); const paid = Boolean(payload.paid); const affectsAccounts = payload.affectsAccounts !== false; const paidDate = paid ? String(payload.paidDate || old.paidDate || new Date().toISOString().slice(0, 10)) : null; const payer = String(payload.payer ?? "Comune"); const commonAccount = payer === "Davide" || payer === "Francesca" || payer === "Comune" ? null : payer; if (!label || !Number.isFinite(amount) || amount <= 0) return Response.json({ error: "Spesa non valida" }, { status: 400 }); const data = { label, section: String(payload.section ?? "Altro").trim() || "Altro", note: String(payload.note ?? "").trim(), amountCents: Math.round(amount * 100), paid, affectsAccounts, paidDate, payer, commonAccount }; const movementId = await syncExpenseMovement(db, old, data); const [expense] = await db.update(tripExpenses).set({ ...data, movementId }).where(eq(tripExpenses.id, id)).returning(); return Response.json({ expense: expenseJson(expense) }); }
    if (action === "repayment") { const [old] = await db.select().from(tripRepayments).where(eq(tripRepayments.id, id)); const label = String(payload.label ?? "").trim(); const kind = payload.kind === "object" ? "object" : "money"; const amount = Number(payload.amount || 0); const dueDate = String(payload.dueDate ?? ""); if (!old || !label || !dueDate || !Number.isFinite(amount) || (kind === "money" && amount <= 0)) return Response.json({ error: "Rientro non valido" }, { status: 400 }); const [trip] = await db.select().from(trips).where(eq(trips.id, old.tripId)); if (trip?.title === "Matrimonio 2026") await removeWeddingGiftFromBbva(db, old); const [repayment] = await db.update(tripRepayments).set({ label, amountCents: kind === "object" ? 0 : Math.round(amount * 100), kind, dueDate, paid: Boolean(payload.paid), note: String(payload.note ?? "").trim() }).where(eq(tripRepayments.id, id)).returning(); if (repayment) await syncWeddingGiftToBbva(db, repayment, trip?.title === "Matrimonio 2026"); return repayment ? Response.json({ repayment: repaymentJson(repayment) }) : Response.json({ error: "Rientro non trovato" }, { status: 404 }); }
    return Response.json({ error: "Azione non valida" }, { status: 400 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Errore inatteso" }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  const denied = await requireAppAccess(request); if (denied) return denied;
  try { const url = new URL(request.url); const action = url.searchParams.get("action"); const id = Number(url.searchParams.get("id")); if (!Number.isInteger(id)) return Response.json({ error: "Elemento non valido" }, { status: 400 }); const db = await getDb();
    if (action === "expense") { const [expense] = await db.select().from(tripExpenses).where(eq(tripExpenses.id, id)); if (expense?.movementId) { await db.delete(commonAccountTransactions).where(eq(commonAccountTransactions.sourceMovementId, expense.movementId)); await db.delete(movements).where(eq(movements.id, expense.movementId)); } await db.delete(tripExpenses).where(eq(tripExpenses.id, id)); }
    else if (action === "repayment") { const [repayment] = await db.select().from(tripRepayments).where(eq(tripRepayments.id, id)); if (repayment) await removeWeddingGiftFromBbva(db, repayment); await db.delete(tripRepayments).where(eq(tripRepayments.id, id)); }
    else if (action === "trip") { const children = await db.select().from(tripExpenses).where(eq(tripExpenses.tripId, id)); for (const expense of children) if (expense.movementId) { await db.delete(commonAccountTransactions).where(eq(commonAccountTransactions.sourceMovementId, expense.movementId)); await db.delete(movements).where(eq(movements.id, expense.movementId)); } await db.delete(tripExpenses).where(eq(tripExpenses.tripId, id)); await db.delete(tripRepayments).where(eq(tripRepayments.tripId, id)); await db.delete(trips).where(eq(trips.id, id)); }
    else return Response.json({ error: "Azione non valida" }, { status: 400 }); return Response.json({ deletedId: id });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Errore inatteso" }, { status: 500 }); }
}
