import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { balanceAdjustments, commonAccountTransactions } from "../../../db/schema";
import { requireAppAccess, verifyRecoveryCode } from "../../../lib/app-security";

async function calculatedBalance(account: string, asOfDate: string, excludedId?: number) {
  const db = await getDb();
  const tx = await db.select().from(commonAccountTransactions).where(eq(commonAccountTransactions.account, account));
  const adjustments = await db.select().from(balanceAdjustments).where(eq(balanceAdjustments.account, account));
  const latest = adjustments
    .filter((row) => row.id !== excludedId && row.date <= asOfDate)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id - a.id)[0];
  const relevantTx = tx.filter((row) => {
    if (row.date > asOfDate) return false;
    if (!latest) return true;
    if (row.date !== latest.date) return row.date > latest.date;
    return row.createdAt > latest.createdAt;
  });
  return (latest?.resultingBalanceCents ?? 0) + relevantTx.reduce((sum, row) => sum + (row.direction === "Entrata" ? row.amountCents : -row.amountCents), 0);
}

export async function GET(request: Request) { const denied = await requireAppAccess(request); if (denied) return denied; const db = await getDb(); const rows = await db.select().from(balanceAdjustments).orderBy(desc(balanceAdjustments.date), desc(balanceAdjustments.id)); return Response.json({ adjustments: rows.map((row) => ({ ...row, delta: row.deltaCents / 100, resultingBalance: row.resultingBalanceCents / 100 })) }); }

export async function POST(request: Request) { const denied = await requireAppAccess(request); if (denied) return denied; const p = await request.json() as { account?: string; actualBalance?: number; date?: string; note?: string; author?: "Davide" | "Francesca"; recoveryCode?: string }; if (!p.account || !p.date || !p.author || !Number.isFinite(Number(p.actualBalance)) || !(await verifyRecoveryCode(p.recoveryCode ?? ""))) return Response.json({ error: "Dati non validi o codice di recupero errato" }, { status: 401 }); const base = await calculatedBalance(p.account, p.date); const actual = Math.round(Number(p.actualBalance) * 100); const db = await getDb(); const [row] = await db.insert(balanceAdjustments).values({ account: p.account, deltaCents: actual - base, resultingBalanceCents: actual, date: p.date, note: p.note?.trim() ?? "", author: p.author }).returning(); return Response.json({ adjustment: { ...row, delta: row.deltaCents / 100, resultingBalance: row.resultingBalanceCents / 100 } }, { status: 201 }); }

export async function PATCH(request: Request) { const denied = await requireAppAccess(request); if (denied) return denied; const p = await request.json() as { id?: number; account?: string; actualBalance?: number; date?: string; note?: string; author?: "Davide" | "Francesca"; recoveryCode?: string }; if (!p.id || !p.account || !p.date || !p.author || !Number.isFinite(Number(p.actualBalance)) || !(await verifyRecoveryCode(p.recoveryCode ?? ""))) return Response.json({ error: "Dati non validi o codice di recupero errato" }, { status: 401 }); const base = await calculatedBalance(p.account, p.date, p.id); const actual = Math.round(Number(p.actualBalance) * 100); const db = await getDb(); const [row] = await db.update(balanceAdjustments).set({ account: p.account, deltaCents: actual - base, resultingBalanceCents: actual, date: p.date, note: p.note?.trim() ?? "", author: p.author }).where(eq(balanceAdjustments.id, p.id)).returning(); return Response.json({ adjustment: { ...row, delta: row.deltaCents / 100, resultingBalance: row.resultingBalanceCents / 100 } }); }

export async function DELETE(request: Request) { const denied = await requireAppAccess(request); if (denied) return denied; const p = await request.json() as { id?: number; recoveryCode?: string }; if (!p.id || !(await verifyRecoveryCode(p.recoveryCode ?? ""))) return Response.json({ error: "Codice di recupero errato" }, { status: 401 }); const db = await getDb(); await db.delete(balanceAdjustments).where(eq(balanceAdjustments.id, p.id)); return Response.json({ deletedId: p.id }); }
