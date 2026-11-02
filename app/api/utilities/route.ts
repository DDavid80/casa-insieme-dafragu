import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { commonAccountTransactions, deadlines, movements, utilityBills } from "../../../db/schema";
import { requireAppAccess } from "../../../lib/app-security";

async function syncPaymentDate(db: Awaited<ReturnType<typeof getDb>>, movementId: number, dueDate: string | null | undefined, invoiceDate: string) {
  const paymentDate = dueDate || invoiceDate;
  await db.update(movements).set({ date: paymentDate }).where(eq(movements.id, movementId));
  await db.update(commonAccountTransactions).set({ date: paymentDate }).where(eq(commonAccountTransactions.sourceMovementId, movementId));
}

export async function GET(request: Request) {
  try {
    const denied = await requireAppAccess(request);
    if (denied) return denied;
    const db = await getDb();
    const rows = await db.select().from(utilityBills)
      .orderBy(desc(utilityBills.date), desc(utilityBills.id))
      .limit(500);
    // Le fatture storiche venivano registrate alla data di emissione. Riallinea
    // il movimento e il conto al giorno di scadenza, senza duplicare nulla.
    for (const row of rows) {
      if (row.dueDate && row.dueDate !== row.date) await syncPaymentDate(db, row.movementId, row.dueDate, row.date);
    }
    return Response.json({
      bills: rows.map((row) => ({
        id: row.id,
        movementId: row.movementId,
        provider: row.provider,
        service: row.service,
        amount: row.amountCents / 100,
        wallet: row.wallet,
        commonAccount: row.commonAccount ?? "BBVA Utenze",
        date: row.date,
        dueDate: row.dueDate,
        recurring: row.recurring,
        billingFrequency: row.billingFrequency,
        deadlineId: row.deadlineId,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        consumption: row.consumption,
        consumptionUnit: row.consumptionUnit,
        meterReading: row.meterReading,
        invoiceNumber: row.invoiceNumber,
        notes: row.notes,
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
      provider?: string;
      service?: string;
      amount?: number;
      wallet?: string;
      date?: string;
      recurring?: boolean;
      billingFrequency?: "monthly" | "annual";
      periodStart?: string | null; periodEnd?: string | null; consumption?: number | null;
      consumptionUnit?: string | null; meterReading?: number | null;
      invoiceNumber?: string | null; notes?: string | null; dueDate?: string | null;
    };
    const provider = payload.provider?.trim() ?? "";
    const service = payload.service?.trim() ?? "";
    const amount = Number(payload.amount);
    if (!provider || !service || !payload.wallet || !payload.date || !Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: "Dati della fattura non validi" }, { status: 400 });
    }
    const db = await getDb();
    const isCommon = !["Davide", "Francesca"].includes(payload.wallet);
    const commonAccount = isCommon ? payload.wallet : null;
    const [movement] = await db.insert(movements).values({
      kind: "Spesa",
      description: `${service} · ${provider}`,
      category: "Utenze",
      amountCents: Math.round(amount * 100),
      person: isCommon ? "Comune" : payload.wallet as "Davide" | "Francesca",
      commonAccount,
      date: payload.dueDate || payload.date,
      dueDate: payload.dueDate || null,
    }).returning();
    if (commonAccount) await db.insert(commonAccountTransactions).values({ account: commonAccount, direction: "Spesa", description: `${service} · ${provider}`, category: "Utenze", amountCents: Math.round(amount * 100), date: payload.dueDate || payload.date, sourceMovementId: movement.id });
    const billingFrequency = payload.billingFrequency === "annual" ? "annual" : "monthly";
    let deadlineId: number | null = null;
    if (payload.recurring) { const [deadline] = await db.insert(deadlines).values({ title: `${service} · ${provider}`, date: payload.date, reminderDays: 2, note: `Utenza ricorrente ${billingFrequency === "annual" ? "annuale" : "mensile"}`, recurrence: billingFrequency === "annual" ? "yearly" : "monthly" }).returning(); deadlineId = deadline.id; }
    const [bill] = await db.insert(utilityBills).values({
      movementId: movement.id,
      provider,
      service,
      amountCents: Math.round(amount * 100),
      wallet: payload.wallet,
      commonAccount,
      date: payload.date,
      recurring: Boolean(payload.recurring),
      billingFrequency,
      deadlineId,
      periodStart: payload.periodStart || null,
      periodEnd: payload.periodEnd || null,
      consumption: Number.isFinite(Number(payload.consumption)) ? Number(payload.consumption) : null,
      consumptionUnit: payload.consumptionUnit || null,
      meterReading: Number.isFinite(Number(payload.meterReading)) ? Number(payload.meterReading) : null,
      invoiceNumber: payload.invoiceNumber?.trim() || null,
      notes: payload.notes?.trim() || null,
    }).returning();
    return Response.json({
      bill: { ...bill, amount: bill.amountCents / 100 },
      movement: {
        id: movement.id,
        kind: movement.kind,
        description: movement.description,
        category: movement.category,
        amount: movement.amountCents / 100,
        person: movement.person,
        commonAccount: movement.commonAccount,
        ticketAmount: movement.ticketAmountCents / 100,
        date: movement.date,
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
      return Response.json({ error: "Fattura non valida" }, { status: 400 });
    }
    const db = await getDb();
    const rows = await db.select().from(utilityBills).where(eq(utilityBills.id, id)).limit(1);
    if (!rows.length) return Response.json({ error: "Fattura non trovata" }, { status: 404 });
    await db.delete(utilityBills).where(eq(utilityBills.id, id));
    if (rows[0].deadlineId) await db.delete(deadlines).where(eq(deadlines.id, rows[0].deadlineId));
    await db.delete(commonAccountTransactions).where(eq(commonAccountTransactions.sourceMovementId, rows[0].movementId));
    await db.delete(movements).where(eq(movements.id, rows[0].movementId));
    return Response.json({ deletedId: id, movementId: rows[0].movementId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore inatteso";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const denied = await requireAppAccess(request); if (denied) return denied;
    const payload = await request.json() as { id?: number; provider?: string; service?: string; amount?: number; wallet?: string; date?: string; dueDate?: string | null; recurring?: boolean; billingFrequency?: "monthly" | "annual"; periodStart?: string | null; periodEnd?: string | null; consumption?: number | null; consumptionUnit?: string | null; meterReading?: number | null; invoiceNumber?: string | null; notes?: string | null };
    const id = Number(payload.id); const provider = payload.provider?.trim() ?? ""; const service = payload.service?.trim() ?? ""; const amount = Number(payload.amount);
    if (!Number.isInteger(id) || id <= 0 || !provider || !service || !payload.wallet || !payload.date || !Number.isFinite(amount) || amount <= 0) return Response.json({ error: "Dati della fattura non validi" }, { status: 400 });
    const db = await getDb(); const [old] = await db.select().from(utilityBills).where(eq(utilityBills.id, id)); if (!old) return Response.json({ error: "Fattura non trovata" }, { status: 404 });
    const isCommon = !["Davide", "Francesca"].includes(payload.wallet); const commonAccount = isCommon ? payload.wallet : null;
    await db.delete(commonAccountTransactions).where(eq(commonAccountTransactions.sourceMovementId, old.movementId));
    const [movement] = await db.update(movements).set({ description: `${service} · ${provider}`, amountCents: Math.round(amount * 100), person: isCommon ? "Comune" : payload.wallet as "Davide" | "Francesca", commonAccount, date: payload.dueDate || payload.date }).where(eq(movements.id, old.movementId)).returning();
    if (commonAccount) await db.insert(commonAccountTransactions).values({ account: commonAccount, direction: "Spesa", description: `${service} · ${provider}`, category: "Utenze", amountCents: Math.round(amount * 100), date: payload.dueDate || payload.date, sourceMovementId: old.movementId });
    const billingFrequency = payload.billingFrequency === "annual" ? "annual" : "monthly";
    let deadlineId = old.deadlineId; if (payload.recurring) { const recurrence = billingFrequency === "annual" ? "yearly" : "monthly"; const note = `Utenza ricorrente ${billingFrequency === "annual" ? "annuale" : "mensile"}`; if (deadlineId) await db.update(deadlines).set({ title: `${service} · ${provider}`, date: payload.date, note, recurrence, completed: false }).where(eq(deadlines.id, deadlineId)); else { const [deadline] = await db.insert(deadlines).values({ title: `${service} · ${provider}`, date: payload.date, reminderDays: 2, note, recurrence }).returning(); deadlineId = deadline.id; } } else if (deadlineId) { await db.delete(deadlines).where(eq(deadlines.id, deadlineId)); deadlineId = null; }
    const [bill] = await db.update(utilityBills).set({ provider, service, amountCents: Math.round(amount * 100), wallet: payload.wallet, commonAccount, date: payload.date, dueDate: payload.dueDate || null, recurring: Boolean(payload.recurring), billingFrequency, deadlineId, periodStart: payload.periodStart || null, periodEnd: payload.periodEnd || null, consumption: Number.isFinite(Number(payload.consumption)) ? Number(payload.consumption) : null, consumptionUnit: payload.consumptionUnit || null, meterReading: Number.isFinite(Number(payload.meterReading)) ? Number(payload.meterReading) : null, invoiceNumber: payload.invoiceNumber?.trim() || null, notes: payload.notes?.trim() || null }).where(eq(utilityBills.id, id)).returning();
    return Response.json({ bill: { ...bill, amount: bill.amountCents / 100 }, movement: { ...movement, amount: movement.amountCents / 100, ticketAmount: movement.ticketAmountCents / 100 } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Errore inatteso" }, { status: 500 }); }
}
