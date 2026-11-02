import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { isScheduledPrepaidExpense } from "../../../lib/prepaid-card";
import {
  commonAccountTransactions,
  debtAdjustments,
  debtPayments,
  debts,
  goalContributions,
  movements,
  personalPlanAdjustments,
  personalPlanPayments,
  personalPlans,
  scheduledMovements,
} from "../../../db/schema";
import {
  requireAppAccess,
  verifyRecoveryCode,
} from "../../../lib/app-security";

const cents = (value: unknown) => Math.round(Number(value ?? 0) * 100);
const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
function dueDate(year: number, month: number, day: number) {
  return new Date(
    year,
    month,
    Math.min(day, new Date(year, month + 1, 0).getDate()),
    12,
  );
}
function endFromDuration(
  startDate: unknown,
  durationMonths: unknown,
  fallback: unknown,
) {
  const duration = Number(durationMonths || 0);
  if (!duration) return fallback ? String(fallback) : null;
  const start = new Date(`${String(startDate)}T12:00:00`);
  const day = start.getDate();
  const end = new Date(start.getFullYear(), start.getMonth() + duration, 1, 12);
  end.setDate(
    Math.min(day, new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()),
  );
  return iso(end);
}

async function addMovementEffects(
  db: Awaited<ReturnType<typeof getDb>>,
  row: typeof movements.$inferSelect,
) {
  if (
    row.commonAccount &&
    row.commonAccount !== "Ticket Satispay" &&
    !isScheduledPrepaidExpense(row) &&
    (row.person === "Davide" || row.person === "Francesca") &&
    row.kind === "Spesa"
  )
    await db.insert(commonAccountTransactions).values({
      account: row.commonAccount,
      direction: "Entrata",
      description: `Versamento da ${row.person}`,
      category: "Versamento",
      amountCents: row.amountCents,
      date: row.date,
      sourceMovementId: row.id,
    });
  if (row.commonAccount && row.commonAccount !== "Ticket Satispay" && row.person === "Comune")
    await db.insert(commonAccountTransactions).values({
      account: row.commonAccount,
      direction: row.kind,
      description: row.description,
      category: row.category,
      amountCents: row.amountCents,
      date: row.date,
      sourceMovementId: row.id,
    });
  // A scheduled personal expense paid with the prepaid card is an outflow
  // from that card, while its movement remains attributed to the person.
  if (isScheduledPrepaidExpense(row) && row.commonAccount)
    await db.insert(commonAccountTransactions).values({
      account: row.commonAccount,
      direction: "Spesa",
      description: row.description,
      category: row.category,
      amountCents: row.amountCents,
      date: row.date,
      sourceMovementId: row.id,
    });
  const ticketAmountCents = row.kind === "Spesa" && row.ticketAmountCents <= 0 && (/ticket/i.test(row.category) || row.commonAccount === "Ticket Satispay") ? row.amountCents : row.ticketAmountCents;
  if (row.commonAccount === "Ticket Satispay")
    await db.insert(commonAccountTransactions).values({
      account: "Ticket Satispay",
      direction: row.kind,
      description: row.kind === "Spesa" ? `Ticket · ${row.description}` : row.description,
      category: row.category,
      amountCents: row.kind === "Spesa" ? ticketAmountCents : row.amountCents,
      date: row.date,
      sourceMovementId: row.id,
    });
  if (row.kind === "Spesa" && ticketAmountCents > 0 && row.commonAccount !== "Ticket Satispay")
    await db.insert(commonAccountTransactions).values({
      account: "Ticket Satispay",
      direction: "Spesa",
      description: `Ticket · ${row.description}`,
      category: row.category,
      amountCents: ticketAmountCents,
      date: row.date,
      sourceMovementId: row.id,
    });
  if (row.goalId && row.kind === "Spesa")
    await db.insert(goalContributions).values({
      goalId: row.goalId,
      source: `${row.person} · ${row.description}`,
      amountCents: row.amountCents,
      date: row.date,
      sourceMovementId: row.id,
    });
}

async function materialize() {
  const db = await getDb();
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  for (const plan of await db.select().from(personalPlans)) {
    if (
      !plan.active ||
      !plan.automatic ||
      plan.monthlyAmountCents <= 0 ||
      plan.frequencyMonths <= 0 ||
      plan.paymentTiming === "libera"
    )
      continue;
    const start = new Date(`${plan.startDate}T12:00:00`);
    const end = plan.endDate ? new Date(`${plan.endDate}T12:00:00`) : today;
    for (
      let cursor = new Date(
        start.getFullYear(),
        start.getMonth() +
          (plan.paymentTiming === "posticipata" ? plan.frequencyMonths : 0),
        1,
        12,
      );
      cursor <= today && cursor <= end;
      cursor.setMonth(cursor.getMonth() + plan.frequencyMonths)
    ) {
      const date = iso(
        dueDate(cursor.getFullYear(), cursor.getMonth(), plan.dayOfMonth),
      );
      if (
        date < plan.startDate ||
        (plan.endDate && date > plan.endDate) ||
        new Date(`${date}T12:00:00`) > today
      )
        continue;
      if (
        !(
          await db
            .select({ id: personalPlanPayments.id })
            .from(personalPlanPayments)
            .where(
              and(
                eq(personalPlanPayments.planId, plan.id),
                eq(personalPlanPayments.date, date),
              ),
            )
            .limit(1)
        ).length
      )
        await db
          .insert(personalPlanPayments)
          .values({
            planId: plan.id,
            amountCents: plan.monthlyAmountCents,
            date,
            note: `Versamento automatico · ogni ${plan.frequencyMonths} mese${plan.frequencyMonths === 1 ? "" : "i"}`,
            automatic: true,
            author: plan.author,
          })
          .onConflictDoNothing();
    }
  }
  for (const schedule of await db.select().from(scheduledMovements)) {
    if (!schedule.active) continue;
    const start = new Date(`${schedule.startDate}T12:00:00`);
    const end = schedule.endDate
      ? new Date(`${schedule.endDate}T12:00:00`)
      : today;
    for (
      let cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12);
      cursor <= today && cursor <= end;
      cursor.setMonth(cursor.getMonth() + 1)
    ) {
      const date = iso(
        dueDate(cursor.getFullYear(), cursor.getMonth(), schedule.dayOfMonth),
      );
      if (
        date < schedule.startDate ||
        (schedule.endDate && date > schedule.endDate) ||
        new Date(`${date}T12:00:00`) > today
      )
        continue;
      if (
        !(
          await db
            .select({ id: movements.id })
            .from(movements)
            .where(
              and(
                eq(movements.scheduleId, schedule.id),
                eq(movements.date, date),
              ),
            )
            .limit(1)
        ).length
      ) {
        const [row] = await db
          .insert(movements)
          .values({
            kind: schedule.kind,
            description: schedule.name,
            category: schedule.category,
            amountCents: schedule.amountCents,
            person: schedule.person,
            commonAccount: schedule.commonAccount,
            ticketAmountCents: schedule.kind === "Spesa" && schedule.ticketAmountCents <= 0 && (/ticket/i.test(schedule.category) || schedule.commonAccount === "Ticket Satispay") ? schedule.amountCents : schedule.ticketAmountCents,
            goalId: schedule.goalId,
            scheduleId: schedule.id,
            date,
          })
          .returning();
        await addMovementEffects(db, row);
      }
    }
  }
  for (const debt of await db.select().from(debts)) {
    if (
      !debt.active ||
      !debt.automatic ||
      debt.variable ||
      debt.installmentCents <= 0
    )
      continue;
    const start = new Date(`${debt.startDate}T12:00:00`);
    const end = debt.endDate ? new Date(`${debt.endDate}T12:00:00`) : today;
    for (
      let cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12);
      cursor <= today && cursor <= end;
      cursor.setMonth(cursor.getMonth() + 1)
    ) {
      const date = iso(
        dueDate(cursor.getFullYear(), cursor.getMonth(), debt.dayOfMonth),
      );
      if (
        date < debt.startDate ||
        (debt.endDate && date > debt.endDate) ||
        new Date(`${date}T12:00:00`) > today
      )
        continue;
      if (
        !(
          await db
            .select({ id: debtPayments.id })
            .from(debtPayments)
            .where(
              and(
                eq(debtPayments.debtId, debt.id),
                eq(debtPayments.date, date),
              ),
            )
            .limit(1)
        ).length
      ) {
        const [movement] = await db
          .insert(movements)
          .values({
            kind: "Spesa",
            description: debt.name,
            category: debt.kind,
            amountCents: debt.installmentCents,
            person: debt.person,
            commonAccount: debt.commonAccount,
            date,
          })
          .returning();
        await addMovementEffects(db, movement);
        await db.insert(debtPayments).values({
          debtId: debt.id,
          amountCents: debt.installmentCents,
          date,
          note: "Rata mensile automatica",
          automatic: true,
          movementId: movement.id,
          author: debt.author,
        });
      }
    }
  }

  // Una rata di finanziamento automatica non deve avere un secondo automatismo
  // mensile parallelo. Elimina la regola duplicata e tutti i suoi movimenti,
  // lasciando intatta la rata generata dal piano di finanziamento.
  for (const debt of await db.select().from(debts)) {
    if (!debt.active || !debt.automatic || debt.variable || debt.installmentCents <= 0)
      continue;
    const duplicateSchedules = await db
      .select()
      .from(scheduledMovements)
      .where(
        and(
          eq(scheduledMovements.kind, "Spesa"),
          eq(scheduledMovements.name, `Rata ${debt.name}`),
          eq(scheduledMovements.amountCents, debt.installmentCents),
          eq(scheduledMovements.person, debt.person),
          eq(scheduledMovements.dayOfMonth, debt.dayOfMonth),
        ),
      );
    for (const schedule of duplicateSchedules) {
      const duplicateMovements = await db
        .select({ id: movements.id })
        .from(movements)
        .where(eq(movements.scheduleId, schedule.id));
      for (const duplicate of duplicateMovements) {
        await db
          .delete(commonAccountTransactions)
          .where(eq(commonAccountTransactions.sourceMovementId, duplicate.id));
        await db
          .delete(goalContributions)
          .where(eq(goalContributions.sourceMovementId, duplicate.id));
        await db.delete(movements).where(eq(movements.id, duplicate.id));
      }
      await db
        .delete(scheduledMovements)
        .where(eq(scheduledMovements.id, schedule.id));
    }
  }
}

export async function GET(request: Request) {
  const denied = await requireAppAccess(request);
  if (denied) return denied;
  try {
    await materialize();
    const db = await getDb();
    const planPayments = (
      await db
        .select()
        .from(personalPlanPayments)
        .orderBy(desc(personalPlanPayments.date), desc(personalPlanPayments.id))
    ).filter((payment) => !payment.skipped);
    return Response.json({
      plans: await db
        .select()
        .from(personalPlans)
        .orderBy(desc(personalPlans.id)),
      planPayments,
      planAdjustments: await db
        .select()
        .from(personalPlanAdjustments)
        .orderBy(
          desc(personalPlanAdjustments.adjustedAt),
          desc(personalPlanAdjustments.id),
        ),
      debts: await db.select().from(debts).orderBy(desc(debts.id)),
      debtAdjustments: await db
        .select()
        .from(debtAdjustments)
        .orderBy(desc(debtAdjustments.adjustedAt), desc(debtAdjustments.id)),
      debtPayments: await db
        .select()
        .from(debtPayments)
        .orderBy(desc(debtPayments.date), desc(debtPayments.id)),
      schedules: await db
        .select()
        .from(scheduledMovements)
        .orderBy(desc(scheduledMovements.id)),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Errore inatteso" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const denied = await requireAppAccess(request);
  if (denied) return denied;
  try {
    const p = (await request.json()) as Record<string, unknown>;
    const db = await getDb();
    const entity = String(p.entity);
    let row: unknown;
    if (entity === "debtAdjustment") {
      const debtId = Number(p.debtId);
      const actualResidual = Number(p.actualResidual);
      if (!debtId || !Number.isFinite(actualResidual) || actualResidual < 0 || !(await verifyRecoveryCode(String(p.recoveryCode ?? ""))))
        return Response.json({ error: "Dati non validi o codice di recupero errato" }, { status: 401 });
      const debt = (await db.select().from(debts).where(eq(debts.id, debtId)).limit(1))[0];
      if (!debt) return Response.json({ error: "Finanziamento non trovato" }, { status: 404 });
      const payments = await db.select().from(debtPayments).where(eq(debtPayments.debtId, debtId));
      const adjustments = await db.select().from(debtAdjustments).where(eq(debtAdjustments.debtId, debtId));
      const previousResidualCents = Math.max(0, debt.originalAmountCents - debt.initialPaidCents - payments.reduce((sum, payment) => sum + payment.amountCents, 0) + adjustments.reduce((sum, adjustment) => sum + adjustment.deltaCents, 0));
      const newResidualCents = cents(actualResidual);
      [row] = await db.insert(debtAdjustments).values({
        debtId,
        previousResidualCents,
        newResidualCents,
        deltaCents: newResidualCents - previousResidualCents,
        note: String(p.note ?? "").trim(),
        author: p.author as "Davide" | "Francesca",
      }).returning();
      return Response.json({ item: row }, { status: 201 });
    } else if (entity === "planAdjustment") {
      const planId = Number(p.planId);
      const actualBalance = Number(p.actualBalance);
      if (
        !planId ||
        !Number.isFinite(actualBalance) ||
        actualBalance < 0 ||
        !(await verifyRecoveryCode(String(p.recoveryCode ?? "")))
      )
        return Response.json(
          { error: "Dati non validi o codice di recupero errato" },
          { status: 401 },
        );
      const plan = (
        await db
          .select()
          .from(personalPlans)
          .where(eq(personalPlans.id, planId))
          .limit(1)
      )[0];
      if (!plan)
        return Response.json({ error: "Piano non trovato" }, { status: 404 });
      const payments = (
        await db
          .select()
          .from(personalPlanPayments)
          .where(eq(personalPlanPayments.planId, planId))
      ).filter((payment) => !payment.skipped);
      const adjustments = await db
        .select()
        .from(personalPlanAdjustments)
        .where(eq(personalPlanAdjustments.planId, planId));
      const previousBalanceCents =
        plan.initialSavedCents +
        payments.reduce((sum, payment) => sum + payment.amountCents, 0) +
        adjustments.reduce((sum, adjustment) => sum + adjustment.deltaCents, 0);
      const newBalanceCents = cents(actualBalance);
      [row] = await db
        .insert(personalPlanAdjustments)
        .values({
          planId,
          previousBalanceCents,
          newBalanceCents,
          deltaCents: newBalanceCents - previousBalanceCents,
          note: String(p.note ?? "").trim(),
          author: p.author as "Davide" | "Francesca",
        })
        .returning();
      return Response.json({ item: row }, { status: 201 });
    } else if (entity === "plan")
      [row] = await db
        .insert(personalPlans)
        .values({
          person: p.person as "Davide" | "Francesca" | "Comune",
          name: String(p.name).trim(),
          kind: String(p.kind || "PAC"),
          institution: String(p.institution || ""),
          targetCents: cents(p.target),
          monthlyAmountCents: cents(p.monthlyAmount),
          initialSavedCents: cents(p.initialSaved),
          frequencyMonths: Number(p.frequencyMonths || 0),
          paymentTiming: (p.paymentTiming || "libera") as
            | "anticipata"
            | "posticipata"
            | "libera",
          durationMonths: Number(p.durationMonths || 0),
          taxRateBps: Math.round(Number(p.taxRate || 0) * 100),
          taxAmountCents: cents(p.taxAmount),
          dayOfMonth: Number(p.dayOfMonth || 1),
          startDate: String(p.startDate),
          endDate: endFromDuration(p.startDate, p.durationMonths, p.endDate),
          automatic: Boolean(p.automatic),
          active: p.active !== false,
          reminderDays: Number(p.reminderDays || 7),
          notes: String(p.notes || ""),
          author: p.author as "Davide" | "Francesca",
        })
        .returning();
    else if (entity === "planPayment")
      [row] = await db
        .insert(personalPlanPayments)
        .values({
          planId: Number(p.planId),
          amountCents: cents(p.amount),
          date: String(p.date),
          note: String(p.note || ""),
          automatic: false,
          author: p.author as "Davide" | "Francesca",
        })
        .returning();
    else if (entity === "debt")
      [row] = await db
        .insert(debts)
        .values({
          person: p.person as "Davide" | "Francesca" | "Comune",
          name: String(p.name).trim(),
          kind: String(p.kind),
          creditor: String(p.creditor || ""),
          originalAmountCents: cents(p.originalAmount),
          installmentCents: cents(p.installment),
          initialPaidCents: cents(p.initialPaid),
          dayOfMonth: Number(p.dayOfMonth || 1),
          startDate: String(p.startDate),
          endDate: p.endDate ? String(p.endDate) : null,
          automatic: Boolean(p.automatic),
          variable: Boolean(p.variable),
          active: p.active !== false,
          commonAccount: p.commonAccount ? String(p.commonAccount) : null,
          reminderDays: Number(p.reminderDays || 7),
          notes: String(p.notes || ""),
          author: p.author as "Davide" | "Francesca",
        })
        .returning();
    else if (entity === "debtPayment") {
      const debt = (
        await db
          .select()
          .from(debts)
          .where(eq(debts.id, Number(p.debtId)))
          .limit(1)
      )[0];
      if (!debt)
        return Response.json({ error: "Voce non trovata" }, { status: 404 });
      const [movement] = await db
        .insert(movements)
        .values({
          kind: "Spesa",
          description: debt.name,
          category: debt.kind,
          amountCents: cents(p.amount),
          person: debt.person,
          commonAccount: debt.commonAccount,
          date: String(p.date),
        })
        .returning();
      await addMovementEffects(db, movement);
      [row] = await db
        .insert(debtPayments)
        .values({
          debtId: debt.id,
          amountCents: cents(p.amount),
          date: String(p.date),
          note: String(p.note || ""),
          automatic: false,
          movementId: movement.id,
          author: p.author as "Davide" | "Francesca",
        })
        .returning();
    } else if (entity === "schedule")
      [row] = await db
        .insert(scheduledMovements)
        .values({
          name: String(p.name).trim(),
          kind: p.kind as "Spesa" | "Entrata",
          category: String(p.category),
          amountCents: cents(p.amount),
          person: p.person as "Davide" | "Francesca" | "Comune",
          commonAccount: p.commonAccount ? String(p.commonAccount) : null,
          ticketAmountCents: cents(p.ticketAmount),
          goalId: p.goalId ? Number(p.goalId) : null,
          dayOfMonth: Number(p.dayOfMonth || 1),
          startDate: String(p.startDate),
          endDate: p.endDate ? String(p.endDate) : null,
          active: true,
          author: p.author as "Davide" | "Francesca",
        })
        .returning();
    else return Response.json({ error: "Tipo non valido" }, { status: 400 });
    await materialize();
    return Response.json({ item: row }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Errore inatteso" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const denied = await requireAppAccess(request);
  if (denied) return denied;
  try {
    const p = (await request.json()) as Record<string, unknown>;
    const db = await getDb();
    const id = Number(p.id);
    const entity = String(p.entity);
    let row: unknown;
    if (entity === "planStatus")
      [row] = await db.update(personalPlans).set({ active: Boolean(p.active) }).where(eq(personalPlans.id, id)).returning();
    else if (entity === "debtStatus")
      [row] = await db.update(debts).set({ active: Boolean(p.active) }).where(eq(debts.id, id)).returning();
    else if (entity === "plan")
      [row] = await db
        .update(personalPlans)
        .set({
          person: p.person as "Davide" | "Francesca" | "Comune",
          name: String(p.name),
          kind: String(p.kind),
          institution: String(p.institution || ""),
          targetCents: cents(p.target),
          monthlyAmountCents: cents(p.monthlyAmount),
          initialSavedCents: cents(p.initialSaved),
          frequencyMonths: Number(p.frequencyMonths || 0),
          paymentTiming: (p.paymentTiming || "libera") as
            | "anticipata"
            | "posticipata"
            | "libera",
          durationMonths: Number(p.durationMonths || 0),
          taxRateBps: Math.round(Number(p.taxRate || 0) * 100),
          taxAmountCents: cents(p.taxAmount),
          dayOfMonth: Number(p.dayOfMonth || 1),
          startDate: String(p.startDate),
          endDate: endFromDuration(p.startDate, p.durationMonths, p.endDate),
          automatic: Boolean(p.automatic),
          active: Boolean(p.active),
          reminderDays: Number(p.reminderDays),
          notes: String(p.notes || ""),
          author: p.author as "Davide" | "Francesca",
        })
        .where(eq(personalPlans.id, id))
        .returning();
    else if (entity === "debt")
      [row] = await db
        .update(debts)
        .set({
          person: p.person as "Davide" | "Francesca" | "Comune",
          name: String(p.name),
          kind: String(p.kind),
          creditor: String(p.creditor || ""),
          originalAmountCents: cents(p.originalAmount),
          installmentCents: cents(p.installment),
          initialPaidCents: cents(p.initialPaid),
          dayOfMonth: Number(p.dayOfMonth),
          startDate: String(p.startDate),
          endDate: p.endDate ? String(p.endDate) : null,
          automatic: Boolean(p.automatic),
          variable: Boolean(p.variable),
          active: Boolean(p.active),
          commonAccount: p.commonAccount ? String(p.commonAccount) : null,
          reminderDays: Number(p.reminderDays),
          notes: String(p.notes || ""),
          author: p.author as "Davide" | "Francesca",
        })
        .where(eq(debts.id, id))
        .returning();
    else if (entity === "schedule")
      [row] = await db
        .update(scheduledMovements)
        .set({
          name: String(p.name),
          kind: p.kind as "Spesa" | "Entrata",
          category: String(p.category),
          amountCents: cents(p.amount),
          person: p.person as "Davide" | "Francesca" | "Comune",
          commonAccount: p.commonAccount ? String(p.commonAccount) : null,
          ticketAmountCents: cents(p.ticketAmount),
          goalId: p.goalId ? Number(p.goalId) : null,
          dayOfMonth: Number(p.dayOfMonth),
          startDate: String(p.startDate),
          endDate: p.endDate ? String(p.endDate) : null,
          active: Boolean(p.active),
          author: p.author as "Davide" | "Francesca",
        })
        .where(eq(scheduledMovements.id, id))
        .returning();
    else if (entity === "planPayment")
      [row] = await db
        .update(personalPlanPayments)
        .set({
          amountCents: cents(p.amount),
          date: String(p.date),
          note: String(p.note || ""),
          author: p.author as "Davide" | "Francesca",
        })
        .where(eq(personalPlanPayments.id, id))
        .returning();
    else if (entity === "debtPayment") {
      const existing = (
        await db
          .select()
          .from(debtPayments)
          .where(eq(debtPayments.id, id))
          .limit(1)
      )[0];
      [row] = await db
        .update(debtPayments)
        .set({
          amountCents: cents(p.amount),
          date: String(p.date),
          note: String(p.note || ""),
          author: p.author as "Davide" | "Francesca",
        })
        .where(eq(debtPayments.id, id))
        .returning();
      if (existing?.movementId) {
        await db
          .update(movements)
          .set({ amountCents: cents(p.amount), date: String(p.date) })
          .where(eq(movements.id, existing.movementId));
        await db
          .update(commonAccountTransactions)
          .set({ amountCents: cents(p.amount), date: String(p.date) })
          .where(
            eq(commonAccountTransactions.sourceMovementId, existing.movementId),
          );
      }
    } else return Response.json({ error: "Tipo non valido" }, { status: 400 });
    return Response.json({ item: row });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Errore inatteso" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const denied = await requireAppAccess(request);
  if (denied) return denied;
  const url = new URL(request.url);
  const entity = url.searchParams.get("entity");
  const id = Number(url.searchParams.get("id"));
  const db = await getDb();
  if (entity === "plan") {
    await db
      .delete(personalPlanAdjustments)
      .where(eq(personalPlanAdjustments.planId, id));
    await db
      .delete(personalPlanPayments)
      .where(eq(personalPlanPayments.planId, id));
    await db.delete(personalPlans).where(eq(personalPlans.id, id));
  } else if (entity === "planAdjustment") {
    if (
      !(await verifyRecoveryCode(request.headers.get("x-recovery-code") ?? ""))
    )
      return Response.json(
        { error: "Codice di recupero errato" },
        { status: 401 },
      );
    await db
      .delete(personalPlanAdjustments)
      .where(eq(personalPlanAdjustments.id, id));
  } else if (entity === "debtAdjustment") {
    if (!(await verifyRecoveryCode(request.headers.get("x-recovery-code") ?? "")))
      return Response.json({ error: "Codice di recupero errato" }, { status: 401 });
    await db.delete(debtAdjustments).where(eq(debtAdjustments.id, id));
  } else if (entity === "debt") {
    const payments = await db
      .select()
      .from(debtPayments)
      .where(eq(debtPayments.debtId, id));
    for (const payment of payments)
      if (payment.movementId) {
        await db
          .delete(commonAccountTransactions)
          .where(
            eq(commonAccountTransactions.sourceMovementId, payment.movementId),
          );
        await db.delete(movements).where(eq(movements.id, payment.movementId));
      }
    await db.delete(debtPayments).where(eq(debtPayments.debtId, id));
    await db.delete(debtAdjustments).where(eq(debtAdjustments.debtId, id));
    await db.delete(debts).where(eq(debts.id, id));
  } else if (entity === "schedule")
    await db.delete(scheduledMovements).where(eq(scheduledMovements.id, id));
  else if (entity === "planPayment") {
    const payment = (
      await db
        .select()
        .from(personalPlanPayments)
        .where(eq(personalPlanPayments.id, id))
        .limit(1)
    )[0];
    if (payment?.automatic)
      await db
        .update(personalPlanPayments)
        .set({ skipped: true })
        .where(eq(personalPlanPayments.id, id));
    else
      await db
        .delete(personalPlanPayments)
        .where(eq(personalPlanPayments.id, id));
  } else if (entity === "debtPayment") {
    const payment = (
      await db
        .select()
        .from(debtPayments)
        .where(eq(debtPayments.id, id))
        .limit(1)
    )[0];
    if (payment?.movementId) {
      await db
        .delete(commonAccountTransactions)
        .where(
          eq(commonAccountTransactions.sourceMovementId, payment.movementId),
        );
      await db.delete(movements).where(eq(movements.id, payment.movementId));
    }
    await db.delete(debtPayments).where(eq(debtPayments.id, id));
  } else return Response.json({ error: "Tipo non valido" }, { status: 400 });
  return Response.json({ deletedId: id });
}
