import { getDb } from "../../../db";
import { requireAppAccess } from "../../../lib/app-security";
import { validInsurancePlan } from "../../../lib/insurance";

export async function GET(request: Request) {
  const denied = await requireAppAccess(request); if (denied) return denied;
  try {
    const db = (await getDb()).$client;
    const result = await db.prepare("SELECT id, revision, data FROM insurance_plans WHERE id != 'system-insurance-2026-initialized'").all();
    return Response.json({ plans: result.results.map((r: { id: string; revision: number; data: string }) => ({ ...JSON.parse(r.data), id: r.id, revision: r.revision })) });
  } catch (error) { console.error("Insurance load", error); return Response.json({ error: "Impossibile caricare i piani. Riprova." }, { status: 500 }); }
}
export async function PUT(request: Request) {
  const denied = await requireAppAccess(request); if (denied) return denied;
  try {
    const p = await request.json();
    if (!validInsurancePlan(p)) return Response.json({ error: "Controlla nome, anno e importi: l’esborso deve essere maggiore di zero." }, { status: 400 });
    const db = (await getDb()).$client;
    const next = { ...p, revision: p.revision + 1 };
    const result = p.revision === 0
      ? await db.prepare("INSERT INTO insurance_plans (id, revision, data) VALUES (?, 1, ?) ON CONFLICT(id) DO NOTHING").bind(p.id, JSON.stringify(next)).run()
      : await db.prepare("UPDATE insurance_plans SET revision = revision + 1, data = ? WHERE id = ? AND revision = ?").bind(JSON.stringify(next), p.id, p.revision).run();
    if (!result.meta.changes) return Response.json({ error: "Questo piano è stato aggiornato da un altro dispositivo. Chiudi e ricarica la scheda prima di modificarlo." }, { status: 409 });
    return Response.json({ plan: next });
  } catch (error) { console.error("Insurance save", error); return Response.json({ error: "Salvataggio non riuscito. I valori inseriti sono ancora qui: riprova." }, { status: 500 }); }
}
export async function DELETE(request: Request) {
  const denied = await requireAppAccess(request); if (denied) return denied;
  try {
    const { id, revision } = await request.json();
    const db = (await getDb()).$client;
    const result = await db.prepare("DELETE FROM insurance_plans WHERE id = ? AND revision = ?").bind(id, revision).run();
    if (!result.meta.changes) return Response.json({ error: "Il piano è cambiato: ricarica prima di eliminarlo." }, { status: 409 });
    return Response.json({ ok: true });
  } catch (error) { console.error("Insurance delete", error); return Response.json({ error: "Eliminazione non riuscita." }, { status: 500 }); }
}

// One-time initialization: edits and intentional deletions are never overwritten.
export async function POST(request: Request) {
  const denied = await requireAppAccess(request); if (denied) return denied;
  try {
    const db = (await getDb()).$client;
    const plan = { id: "davide-assicurazioni-2026", revision: 1, name: "Toyota · BYD · Scooter 2026", person: "Davide", year: 2026, account: "BBVA Dafragu", standard: 25000, recovery: 15000,
      expenses: [{ label: "Toyota", cents: 87036 }, { label: "BYD", cents: 9600 }, { label: "Scooter", cents: 19100 }],
      months: Array.from({ length: 12 }, (_, i) => ({ standard: i < 9 ? 25000 : 0, recovery: i < 9 ? 15000 : 0, paid: i < 9 })) };
    await db.batch([
      db.prepare("INSERT INTO insurance_plans (id, revision, data) SELECT ?, 1, ? WHERE NOT EXISTS (SELECT 1 FROM insurance_plans WHERE id = 'system-insurance-2026-initialized') AND NOT EXISTS (SELECT 1 FROM insurance_plans WHERE json_extract(data, '$.person') = 'Davide' AND json_extract(data, '$.year') = 2026) ON CONFLICT(id) DO NOTHING").bind(plan.id, JSON.stringify(plan)),
      db.prepare("INSERT INTO insurance_plans (id, revision, data) VALUES ('system-insurance-2026-initialized', 1, '{}') ON CONFLICT(id) DO NOTHING")
    ]);
    return Response.json({ ok: true });
  } catch (error) { console.error("Insurance initialization", error); return Response.json({ error: "Preparazione piano non riuscita." }, { status: 500 }); }
}
