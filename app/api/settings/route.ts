import { getDb } from "../../../db";
import { balanceAdjustments, commonAccountTransactions, debts, movements, scheduledMovements, settings, tripExpenses, utilityBills } from "../../../db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAppAccess } from "../../../lib/app-security";

export async function GET(request: Request) {
  try {
    const denied = await requireAppAccess(request);
    if (denied) return denied;
    const db = await getDb();
    const rows = await db.select().from(settings).limit(1);
    const raw = rows[0]?.commonAccounts ?? '["N26","BBVA Dafragu","BBVA Utenze"]';
    let commonAccounts: string[] = ["N26", "BBVA Dafragu", "BBVA Utenze", "Ticket Satispay"];
    try { const parsed = JSON.parse(raw); if (Array.isArray(parsed) && parsed.length >= 1 && parsed.every((item) => typeof item === "string")) commonAccounts = parsed; } catch { /* use defaults */ }
    return Response.json({ title: rows[0]?.title ?? "Casa Insieme", commonAccounts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore inatteso";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const denied = await requireAppAccess(request);
    if (denied) return denied;
    const payload = (await request.json()) as { title?: string; commonAccounts?: string[]; mode?: "reorder"; expectedAccounts?: string[] };
    const title = payload.title?.trim() ?? "";
    if (!title || title.length > 40) {
      return Response.json({ error: "Il nome deve contenere da 1 a 40 caratteri" }, { status: 400 });
    }
    const commonAccounts = payload.commonAccounts?.map((item) => item.trim()) ?? null;
    if (commonAccounts && (commonAccounts.length < 1 || commonAccounts.some((item) => !item || item.length > 60) || new Set(commonAccounts.map((item) => item.toLowerCase())).size !== commonAccounts.length)) return Response.json({ error: "Serve almeno un conto e i nomi devono essere diversi" }, { status: 400 });
    const db = await getDb(); const oldRows = await db.select().from(settings).limit(1); let oldAccounts = ["N26", "BBVA Dafragu", "BBVA Utenze", "Ticket Satispay"];
    try { const parsed = JSON.parse(oldRows[0]?.commonAccounts ?? "[]"); if (Array.isArray(parsed) && parsed.length >= 1) oldAccounts = parsed; } catch { /* defaults */ }
    if (payload.mode === "reorder") {
      if (!commonAccounts || commonAccounts.length !== oldAccounts.length || oldAccounts.some((name: string) => !commonAccounts.includes(name))) return Response.json({error:"L’elenco conti è cambiato. Aggiorna e riprova."},{status:409});
      await db.update(settings).set({commonAccounts:JSON.stringify(commonAccounts),updatedAt:new Date().toISOString()}).where(eq(settings.id,oldRows[0].id));
      return Response.json({title:oldRows[0].title,commonAccounts});
    }
    if (payload.expectedAccounts && JSON.stringify(payload.expectedAccounts) !== JSON.stringify(oldAccounts)) return Response.json({error:"I conti sono stati aggiornati da un altro dispositivo. Ricarica prima di rinominare."},{status:409});
    const renames = commonAccounts ? oldAccounts.flatMap((name,index) => index < commonAccounts.length && name !== commonAccounts[index] ? [[name,commonAccounts[index]]] : []) : [];
    const renameColumn = (column:any) => sql`CASE ${column} ${sql.join(renames.map(([from,to])=>sql`WHEN ${from} THEN ${to}`),sql` `)} ELSE ${column} END`;
    const writes:any[] = [];
    if (renames.length) {
      writes.push(db.update(movements).set({commonAccount:renameColumn(movements.commonAccount)}));
      writes.push(db.update(commonAccountTransactions).set({account:renameColumn(commonAccountTransactions.account)}));
      writes.push(db.update(balanceAdjustments).set({account:renameColumn(balanceAdjustments.account)}));
      writes.push(db.update(scheduledMovements).set({commonAccount:renameColumn(scheduledMovements.commonAccount)}));
      writes.push(db.update(debts).set({commonAccount:renameColumn(debts.commonAccount)}));
      writes.push(db.update(tripExpenses).set({commonAccount:renameColumn(tripExpenses.commonAccount)}));
      writes.push(db.update(utilityBills).set({wallet:renameColumn(utilityBills.wallet),commonAccount:renameColumn(utilityBills.commonAccount)}));
    }
    writes.push(db.insert(settings).values({id:1,title,commonAccounts:JSON.stringify(commonAccounts ?? oldAccounts)}).onConflictDoUpdate({target:settings.id,set:{title,commonAccounts:JSON.stringify(commonAccounts ?? oldAccounts),updatedAt:new Date().toISOString()}}));
    await db.batch(writes as any);
    return Response.json({ title, commonAccounts: commonAccounts ?? oldAccounts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore inatteso";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const denied = await requireAppAccess(request);
    if (denied) return denied;
    const account = new URL(request.url).searchParams.get("account")?.trim() ?? "";
    if (!account) return Response.json({ error: "Conto non valido" }, { status: 400 });
    const db = await getDb();
    const [row] = await db.select().from(settings).limit(1);
    let accounts = ["N26", "BBVA Dafragu", "BBVA Utenze", "Ticket Satispay"];
    try {
      const parsed = JSON.parse(row?.commonAccounts ?? "[]");
      if (Array.isArray(parsed) && parsed.length >= 1 && parsed.every((item) => typeof item === "string")) accounts = parsed;
    } catch { /* use defaults */ }
    if (!accounts.includes(account)) return Response.json({ error: "Conto non trovato" }, { status: 404 });
    if (accounts.length <= 1) return Response.json({ error: "Deve rimanere almeno un conto comune" }, { status: 400 });
    const commonAccounts = accounts.filter((item) => item !== account);
    await db.insert(settings).values({ id: 1, title: row?.title ?? "Dafragu Home", commonAccounts: JSON.stringify(commonAccounts) }).onConflictDoUpdate({ target: settings.id, set: { commonAccounts: JSON.stringify(commonAccounts), updatedAt: new Date().toISOString() } });
    return Response.json({ deletedAccount: account, commonAccounts });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Errore inatteso" }, { status: 500 });
  }
}
