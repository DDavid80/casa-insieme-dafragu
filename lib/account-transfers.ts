import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { movements, commonAccountTransactions, settings } from "../db/schema";
type Db = Awaited<ReturnType<typeof getDb>>;
const category = "Trasferimento interno";
async function validAccounts(db:Db, from:string, to:string) {
  const [row]=await db.select().from(settings).limit(1);
  const accounts=JSON.parse(row?.commonAccounts ?? "[]");
  return from !== to && from !== "Ticket Satispay" && to !== "Ticket Satispay" && accounts.includes(from) && accounts.includes(to);
}
async function result(db:Db, transferId:string, status=200) {
  const ms=await db.select().from(movements).where(eq(movements.transferId,transferId));
  const ts=await db.select().from(commonAccountTransactions).where(eq(commonAccountTransactions.transferId,transferId));
  const movementRows=ms.map(m=>({...m,amount:m.amountCents/100,ticketAmount:m.ticketAmountCents/100}));
  const transactionRows=ts.map(t=>({...t,amount:t.amountCents/100,person:"Comune"}));
  return Response.json({movements:movementRows,transactions:transactionRows,movement:movementRows[0],transaction:transactionRows[0]}, {status});
}
export async function createAccountTransfer(db:Db,p:any) {
  const from=String(p.account ?? "").trim(),to=String(p.destinationAccount ?? "").trim(),cents=Math.round(Number(p.amount)*100);
  if(!Number.isSafeInteger(cents)||cents<=0||!/^\d{4}-\d{2}-\d{2}$/.test(p.date??"")||!await validAccounts(db,from,to))return Response.json({error:"Seleziona due conti diversi e un importo valido"},{status:400});
  const transferId=crypto.randomUUID(),description=String(p.description||`Trasferimento da ${from} a ${to}`).trim();
  const client=db.$client;
  // One transaction: each ledger entry references the movement inserted immediately before it.
  const statements=[];
  for(const [kind,account] of [["Spesa",from],["Entrata",to]]) {
    statements.push(client.prepare("INSERT INTO movements (kind,description,category,amount_cents,person,common_account,date,transfer_id) VALUES (?,?,?,?,?,?,?,?)").bind(kind,description,category,cents,"Comune",account,p.date,transferId));
    statements.push(client.prepare("INSERT INTO common_account_transactions (account,direction,description,category,amount_cents,date,source_movement_id,transfer_id) VALUES (?,?,?,?,?,?,last_insert_rowid(),?)").bind(account,kind,description,category,cents,p.date,transferId));
  }
  await client.batch(statements);
  return result(db,transferId,201);
}
export async function updateAccountTransfer(db:Db,old:typeof commonAccountTransactions.$inferSelect,p:any) {
  const ts=await db.select().from(commonAccountTransactions).where(eq(commonAccountTransactions.transferId,old.transferId!));
  const other=ts.find(t=>t.id!==old.id),account=String(p.account??"").trim(),cents=Math.round(Number(p.amount)*100);
  if(ts.length!==2||!other||p.kind!==old.direction||!Number.isSafeInteger(cents)||cents<=0||!/^\d{4}-\d{2}-\d{2}$/.test(p.date??"")||!await validAccounts(db,account,other.account))return Response.json({error:"Trasferimento non valido: mantieni la direzione e scegli conti diversi"},{status:400});
  const description=String(p.description??old.description).trim();
  const writes:any[]=[];
  for(const t of ts){const destination=t.id===old.id?account:t.account;
    writes.push(db.update(commonAccountTransactions).set({account:destination,amountCents:cents,date:p.date,description,category}).where(eq(commonAccountTransactions.id,t.id)));
    writes.push(db.update(movements).set({commonAccount:destination,amountCents:cents,date:p.date,description,category,person:"Comune",kind:t.direction}).where(eq(movements.id,t.sourceMovementId!)));
  }
  await db.batch(writes as any);return result(db,old.transferId!);
}
export async function deleteAccountTransfer(db:Db,transferId:string) {
  await db.batch([db.delete(commonAccountTransactions).where(eq(commonAccountTransactions.transferId,transferId)),db.delete(movements).where(eq(movements.transferId,transferId))]);
  return Response.json({deletedTransferId:transferId});
}
