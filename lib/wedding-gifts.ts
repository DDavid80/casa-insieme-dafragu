import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { commonAccountTransactions, movements, tripRepayments, trips } from "../db/schema";

type Db = Awaited<ReturnType<typeof getDb>>;
type Repayment = typeof tripRepayments.$inferSelect;

const giftDescription = (label: string) => `Regalo di nozze · ${label}`;
const isMoneyGift = (repayment: Repayment) => repayment.kind === "money" && repayment.paid && repayment.amountCents > 0;

/** Keeps a received wedding cash gift and BBVA Dafragu as one financial event. */
export async function syncWeddingGiftToBbva(db: Db, repayment: Repayment, wedding: boolean) {
  if (!wedding || !isMoneyGift(repayment)) return null;
  const description = giftDescription(repayment.label);
  const [existing] = await db.select().from(movements).where(and(eq(movements.kind, "Entrata"), eq(movements.category, "Regali di nozze"), eq(movements.description, description), eq(movements.amountCents, repayment.amountCents), eq(movements.date, repayment.dueDate))).limit(1);
  if (existing) {
    const [transaction] = await db.select().from(commonAccountTransactions).where(eq(commonAccountTransactions.sourceMovementId, existing.id));
    if (!transaction) await db.insert(commonAccountTransactions).values({ account: "BBVA Dafragu", direction: "Entrata", description, category: "Regali di nozze", amountCents: repayment.amountCents, date: repayment.dueDate, sourceMovementId: existing.id });
    return existing.id;
  }
  const [movement] = await db.insert(movements).values({ kind: "Entrata", description, category: "Regali di nozze", amountCents: repayment.amountCents, person: "Comune", commonAccount: "BBVA Dafragu", ticketAmountCents: 0, date: repayment.dueDate }).returning();
  await db.insert(commonAccountTransactions).values({ account: "BBVA Dafragu", direction: "Entrata", description, category: "Regali di nozze", amountCents: repayment.amountCents, date: repayment.dueDate, sourceMovementId: movement.id });
  return movement.id;
}

export async function removeWeddingGiftFromBbva(db: Db, repayment: Repayment) {
  const description = giftDescription(repayment.label);
  const linked = await db.select().from(movements).where(and(eq(movements.kind, "Entrata"), eq(movements.category, "Regali di nozze"), eq(movements.description, description), eq(movements.amountCents, repayment.amountCents), eq(movements.date, repayment.dueDate)));
  for (const movement of linked) {
    await db.delete(commonAccountTransactions).where(eq(commonAccountTransactions.sourceMovementId, movement.id));
    await db.delete(movements).where(eq(movements.id, movement.id));
  }
}

/** Removes the old seed gifts accidentally imported into BBVA, then repairs the reported missing gift once. */
export async function reconcileWeddingGifts(db: Db) {
  const [wedding] = await db.select().from(trips).where(eq(trips.title, "Matrimonio 2026"));
  if (!wedding) return;
  const gifts = await db.select().from(tripRepayments).where(eq(tripRepayments.tripId, wedding.id));
  const oldSeedLabels = new Set(["Luca", "Ale Amadei", "Claudio e Cri", "Minelli", "Mamma Emily", "Debora & Mauri", "Ale e Manu"]);
  for (const gift of gifts) {
    if (oldSeedLabels.has(gift.label)) await removeWeddingGiftFromBbva(db, gift);
  }
  const reportedGift = gifts.find((gift) => gift.label.trim().toLocaleLowerCase("it") === "salvatore e giulia");
  if (reportedGift) await syncWeddingGiftToBbva(db, reportedGift, true);
}
