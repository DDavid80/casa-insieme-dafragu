import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { houseDecisions } from "../../../db/schema";
import { requireAppAccess } from "../../../lib/app-security";

export async function GET(request: Request) {
  const denied = await requireAppAccess(request); if (denied) return denied;
  try { const db = await getDb(); return Response.json({ decisions: await db.select().from(houseDecisions).orderBy(desc(houseDecisions.date), desc(houseDecisions.id)) }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Errore inatteso" }, { status: 500 }); }
}

export async function POST(request: Request) {
  const denied = await requireAppAccess(request); if (denied) return denied;
  try {
    const payload = await request.json() as { title?: string; content?: string; author?: string; status?: string; date?: string };
    const title = payload.title?.trim() ?? ""; const author = payload.author === "Francesca" ? "Francesca" : "Davide"; const status = payload.status === "Decisa" ? "Decisa" : "Da valutare";
    if (!title || !payload.date) return Response.json({ error: "Dati non validi" }, { status: 400 });
    const db = await getDb(); const [decision] = await db.insert(houseDecisions).values({ title, content: payload.content?.trim() ?? "", author, status, date: payload.date }).returning();
    return Response.json({ decision }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Errore inatteso" }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  const denied = await requireAppAccess(request); if (denied) return denied;
  try {
    const payload = await request.json() as { id?: number; title?: string; content?: string; author?: string; status?: string; date?: string };
    const id = Number(payload.id); const title = payload.title?.trim() ?? ""; const author = payload.author === "Francesca" ? "Francesca" : "Davide"; const status = payload.status === "Decisa" ? "Decisa" : "Da valutare";
    if (!Number.isInteger(id) || !title || !payload.date) return Response.json({ error: "Dati non validi" }, { status: 400 });
    const db = await getDb(); const [decision] = await db.update(houseDecisions).set({ title, content: payload.content?.trim() ?? "", author, status, date: payload.date }).where(eq(houseDecisions.id, id)).returning();
    if (!decision) return Response.json({ error: "Decisione non trovata" }, { status: 404 }); return Response.json({ decision });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Errore inatteso" }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  const denied = await requireAppAccess(request); if (denied) return denied;
  const id = Number(new URL(request.url).searchParams.get("id")); if (!Number.isInteger(id)) return Response.json({ error: "Elemento non valido" }, { status: 400 });
  try { const db = await getDb(); await db.delete(houseDecisions).where(eq(houseDecisions.id, id)); return Response.json({ deletedId: id }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Errore inatteso" }, { status: 500 }); }
}
